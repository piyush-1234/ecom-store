/**
 * Auth + address-book smoke test against a running server.
 *
 * Exercises the full HTTP surface with a real database and real session cookies:
 *   register -> me -> create address -> list -> update -> delete -> logout -> 401
 *   -> login -> me -> unauthenticated checks
 *
 * Usage:
 *   node scripts/smoke-auth.mjs [baseUrl]
 *
 * Exits non-zero on the first failed assertion so it can gate CI.
 */

const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * Each run pretends to come from a different client, so repeat runs inside the
 * rate-limit window do not trip the limiter.
 *
 * NOTE: the server trusts `x-forwarded-for`, which is only safe behind a proxy
 * that sets it (Vercel does). Exposed directly, it is spoofable — see BLOCKERS BLK-011.
 */
const RUN_IP = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

let cookie = '';
let passed = 0;
const failures = [];

function ok(label, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

async function call(method, path, body) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': RUN_IP };
  if (cookie) headers.cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Capture the session cookie on any response that sets it.
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    const [pair] = raw.split(';');
    if (pair?.startsWith('es_session=')) {
      cookie = pair;
    }
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* some responses have no body */
  }

  return { status: res.status, json };
}

function uniqueEmail() {
  return `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/**
 * A valid Indian mobile that is unique per run.
 * Must start 6-9 and be 10 digits, otherwise our own validator rejects it.
 */
function uniquePhone() {
  const tail = String(Date.now()).slice(-8);
  const last = Math.floor(Math.random() * 10);
  return `9${tail}${last}`;
}

async function main() {
  console.log(`\nAuth smoke test against ${BASE}\n`);

  // --- health ---
  const health = await call('GET', '/api/health');
  ok('health endpoint responds 200 with db up', health.status === 200 && health.json?.db === 'up',
    `status=${health.status} db=${health.json?.db}`);

  // --- unauthenticated access is rejected ---
  const anon = await call('GET', '/api/auth/me');
  ok('GET /api/auth/me without session -> 401', anon.status === 401, `status=${anon.status}`);

  // --- validation is enforced ---
  const badPhone = await call('POST', '/api/auth/register', {
    name: 'X',
    email: uniqueEmail(),
    password: 'secret123',
    phone: '12345',
  });
  ok('register rejects an invalid phone -> 422', badPhone.status === 422, `status=${badPhone.status}`);
  ok('validation error names the field', Boolean(badPhone.json?.error?.details?.fields?.phone),
    JSON.stringify(badPhone.json?.error?.details));

  // --- register ---
  const email = uniqueEmail();
  const password = 'smoke-pass-123';
  const regPhone = uniquePhone();
  const reg = await call('POST', '/api/auth/register', {
    name: 'Smoke Tester',
    email,
    password,
    phone: regPhone,
  });
  ok('register -> 201', reg.status === 201, JSON.stringify(reg.json));
  ok('register returns a user id', Boolean(reg.json?.data?.user?.id));
  ok('register issues a session cookie', cookie.startsWith('es_session='));

  // --- duplicate email ---
  const dupe = await call('POST', '/api/auth/register', {
    name: 'Smoke Tester',
    email,
    password,
  });
  ok('duplicate email -> 409', dupe.status === 409, `status=${dupe.status}`);

  // --- me ---
  const me = await call('GET', '/api/auth/me');
  ok('GET /api/auth/me with session -> 200', me.status === 200, `status=${me.status}`);
  ok('me returns the registered email', me.json?.data?.user?.email === email);

  // --- address create ---
  const created = await call('POST', '/api/account/addresses', {
    fullName: 'Smoke Tester',
    phone: regPhone,
    line1: '12 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
  });
  ok('create address -> 201', created.status === 201, JSON.stringify(created.json));
  const addressId = created.json?.data?.address?.id;
  ok('first address is the default', created.json?.data?.address?.isDefault === true);
  ok(
    'phone normalised to E.164',
    created.json?.data?.address?.phone === `+91${regPhone}`,
    `got ${created.json?.data?.address?.phone}, expected +91${regPhone}`,
  );

  // --- address invalid pincode ---
  const badPin = await call('POST', '/api/account/addresses', {
    fullName: 'Smoke Tester',
    phone: regPhone,
    line1: '12 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '0123',
  });
  ok('invalid pincode -> 422', badPin.status === 422, `status=${badPin.status}`);

  // --- address list ---
  const list = await call('GET', '/api/account/addresses');
  ok('list addresses -> 200 with 1 item',
    list.status === 200 && list.json?.data?.addresses?.length === 1,
    `status=${list.status} count=${list.json?.data?.addresses?.length}`);

  // --- address update ---
  const updated = await call('PATCH', `/api/account/addresses/${addressId}`, {
    city: 'Mumbai',
    pincode: '400001',
  });
  ok('update address -> 200', updated.status === 200, JSON.stringify(updated.json));
  ok('update persisted the new city', updated.json?.data?.address?.city === 'Mumbai');

  // --- cross-user isolation ---
  const foreign = await call('PATCH', '/api/account/addresses/does-not-exist', { city: 'Delhi' });
  ok('updating a non-existent/foreign address -> 404', foreign.status === 404, `status=${foreign.status}`);

  // --- delete ---
  const deleted = await call('DELETE', `/api/account/addresses/${addressId}`);
  ok('delete address -> 200', deleted.status === 200, `status=${deleted.status}`);

  const afterDelete = await call('GET', '/api/account/addresses');
  ok('address list is empty after delete',
    afterDelete.json?.data?.addresses?.length === 0,
    `count=${afterDelete.json?.data?.addresses?.length}`);

  // --- logout ---
  const out = await call('POST', '/api/auth/logout');
  ok('logout -> 200', out.status === 200);

  const afterLogout = await call('GET', '/api/auth/me');
  ok('me after logout -> 401', afterLogout.status === 401, `status=${afterLogout.status}`);

  // --- login ---
  const login = await call('POST', '/api/auth/login', { email, password });
  ok('login -> 200', login.status === 200, JSON.stringify(login.json));
  ok('login issues a new session', cookie.startsWith('es_session='));

  const meAgain = await call('GET', '/api/auth/me');
  ok('me after login -> 200', meAgain.status === 200);

  // --- wrong password ---
  const badLogin = await call('POST', '/api/auth/login', { email, password: 'wrong-pass-1' });
  ok('wrong password -> 401', badLogin.status === 401, `status=${badLogin.status}`);

  const unknown = await call('POST', '/api/auth/login', {
    email: `nobody_${Date.now()}@example.com`,
    password: 'wrong-pass-1',
  });
  ok('unknown email -> 401 (no user enumeration)', unknown.status === 401, `status=${unknown.status}`);

  // --- OTP flow ---
  const phone = `9${String(Date.now()).slice(-9)}`;
  const otpReq = await call('POST', '/api/auth/otp/request', { phone });
  ok('OTP request -> 200', otpReq.status === 200, JSON.stringify(otpReq.json));

  const badOtp = await call('POST', '/api/auth/otp/verify', { phone, code: '000000' });
  ok('wrong OTP -> 400', badOtp.status === 400, `status=${badOtp.status}`);

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    console.log('Failed:\n' + failures.map((f) => `  - ${f}`).join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
