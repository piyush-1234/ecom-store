/**
 * Admin access smoke test.
 *
 * Verifies the guard actually guards, that bad credentials are refused, and that a
 * successful login yields a working admin session.
 *
 * Usage: node scripts/smoke-admin.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.ADMIN_SEED_EMAIL ?? 'admin@ecomerce-store.local';
const PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? 'admin-dev-password-1';
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

async function req(method, path, body) {
  const headers = { 'x-forwarded-for': RUN_IP };
  if (body) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    if (pair?.startsWith('es_admin=')) cookie = pair;
  }

  // Read the body exactly once — a Response body cannot be consumed twice.
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null; // HTML page (redirect/login form)
  }

  return { status: res.status, json, text: json ? '' : raw };
}

async function main() {
  console.log(`\nAdmin smoke test against ${BASE}\n`);

  // --- guard ---
  const guarded = await req('GET', '/admin/orders');
  ok(
    'unauthenticated /admin/orders redirects',
    guarded.status === 307 || guarded.status === 302,
    `status=${guarded.status}`,
  );

  const returnsGuarded = await req('GET', '/admin/returns');
  ok(
    'unauthenticated /admin/returns redirects',
    returnsGuarded.status === 307 || returnsGuarded.status === 302,
    `status=${returnsGuarded.status}`,
  );

  const loginPage = await req('GET', '/admin/login');
  ok('admin login page is reachable', loginPage.status === 200, `status=${loginPage.status}`);

  // --- bad credentials ---
  const bad = await req('POST', '/api/admin/auth/login', { email: EMAIL, password: 'wrong-password-9' });
  ok('wrong admin password -> 401', bad.status === 401, `status=${bad.status}`);

  const unknown = await req('POST', '/api/admin/auth/login', {
    email: 'nobody@example.com',
    password: 'wrong-password-9',
  });
  ok('unknown admin email -> 401 (no enumeration)', unknown.status === 401, `status=${unknown.status}`);

  // --- success ---
  const good = await req('POST', '/api/admin/auth/login', { email: EMAIL, password: PASSWORD });
  ok('valid admin credentials -> 200', good.status === 200, `status=${good.status} ${JSON.stringify(good.json)}`);
  ok('login issues an admin session cookie', cookie.startsWith('es_admin='));

  const orders = await req('GET', '/admin/orders');
  ok('authenticated /admin/orders renders', orders.status === 200, `status=${orders.status}`);

  const returns = await req('GET', '/admin/returns');
  ok('authenticated /admin/returns renders', returns.status === 200, `status=${returns.status}`);

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    console.log('Failed:\n' + failures.map((f) => `  - ${f}`).join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nAdmin smoke test crashed:', error);
  process.exit(1);
});
