/**
 * Deployment preflight.
 *
 * Checks the environment a deployed instance would need, and refuses to pass when
 * something would fail at runtime or, worse, silently misbehave (e.g. local disk
 * storage in production).
 *
 * Usage:
 *   node scripts/preflight.mjs                # check current environment
 *   node scripts/preflight.mjs --production   # stricter: requires real integrations
 *
 * Exits 1 on any FAIL. WARN items are reported but do not fail the run.
 */

import { Client } from 'pg';

const isProduction = process.argv.includes('--production');

const failures = [];
const warnings = [];
const passes = [];

function pass(label, detail = '') {
  passes.push(`${label}${detail ? ` — ${detail}` : ''}`);
}
function warn(label, detail = '') {
  warnings.push(`${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail = '') {
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function requireEnv(name, { minLength } = {}) {
  const value = process.env[name];
  if (!value) {
    fail(`${name} is missing`);
    return '';
  }
  if (minLength && value.length < minLength) {
    fail(`${name} is too short`, `${value.length} chars, need ${minLength}+`);
    return value;
  }
  pass(`${name} is set`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  if (value) pass(`${name} is set`);
  return value ?? '';
}

async function checkDatabase() {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  if (!url) return;

  if (!directUrl) {
    fail('DIRECT_URL is missing', 'migrations bypass the pooler; set the non-pooled URL');
  } else if (url === directUrl) {
    pass('DIRECT_URL matches DATABASE_URL (fine for a direct/non-pooled host)');
  } else {
    pass('DIRECT_URL differs from DATABASE_URL (pooled runtime + direct migrations)');
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8_000 });
  try {
    await client.connect();
    const { rows } = await client.query(
      `select current_database() as db,
              (select count(*) from information_schema.tables where table_schema = 'public')::int as tables`,
    );
    pass('database reachable', `${rows[0].db}, ${rows[0].tables} tables`);

    // Migration state: a deployed app with pending migrations will 500 on new columns.
    try {
      const applied = await client.query(
        `select count(*)::int as applied from _prisma_migrations where finished_at is not null`,
      );
      const failed = await client.query(
        `select count(*)::int as failed from _prisma_migrations where finished_at is null and rolled_back_at is null`,
      );
      if (failed.rows[0].failed > 0) {
        fail('a migration is recorded but did not finish', 'inspect _prisma_migrations');
      } else {
        pass('migrations applied', `${applied.rows[0].applied} migration(s)`);
      }
    } catch {
      warn('could not read _prisma_migrations', 'run `npx prisma migrate deploy` first');
    }

    const products = await client.query(`select count(*)::int as n from "Product"`).catch(() => null);
    if (products && products.rows[0].n === 0) {
      warn('catalogue is empty', 'seed or create products before launch');
    } else if (products) {
      pass('catalogue has products', `${products.rows[0].n} products`);
    }

    const admins = await client
      .query(`select count(*)::int as n from "AdminUser" where "isActive" = true`)
      .catch(() => null);
    if (admins && admins.rows[0].n === 0) {
      warn('no active admin user', 'you will not be able to sign into /admin');
    } else if (admins) {
      pass('admin user exists', `${admins.rows[0].n} active`);
    }
  } catch (error) {
    fail('database unreachable', error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

function checkUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!url) {
    fail('NEXT_PUBLIC_APP_URL is missing', 'invoice links and emails depend on it');
    return;
  }
  if (isProduction && !url.startsWith('https://')) {
    fail('NEXT_PUBLIC_APP_URL must be https in production', url);
  } else {
    pass('NEXT_PUBLIC_APP_URL looks right', url);
  }
  if (url.includes('localhost') && isProduction) {
    fail('NEXT_PUBLIC_APP_URL points at localhost in production');
  }
}

function checkIntegrations() {
  const razorpay = process.env.RAZORPAY_ENABLED === 'true';
  if (razorpay) {
    requireEnv('RAZORPAY_KEY_ID');
    requireEnv('RAZORPAY_KEY_SECRET');
    requireEnv('RAZORPAY_WEBHOOK_SECRET');
    if (!process.env.RAZORPAY_KEY_ID?.startsWith('rzp_')) {
      warn('RAZORPAY_KEY_ID does not look like a Razorpay key', 'expected an rzp_ prefix');
    }
  } else {
    const message = 'RAZORPAY_ENABLED is false — prepaid checkout is disabled in the UI';
    if (isProduction) fail(message);
    else warn(message);
  }

  const shiprocket = process.env.SHIPROCKET_ENABLED === 'true';
  if (shiprocket) {
    requireEnv('SHIPROCKET_EMAIL');
    requireEnv('SHIPROCKET_PASSWORD');
    requireEnv('SHIPROCKET_WEBHOOK_TOKEN');
  } else {
    const message = 'SHIPROCKET_ENABLED is false — no shipments are created automatically';
    if (isProduction) warn(message);
    else warn(message);
  }

  const email = process.env.EMAIL_ENABLED === 'true';
  if (email) {
    requireEnv('RESEND_API_KEY');
    requireEnv('EMAIL_FROM');
  } else {
    const message = 'EMAIL_ENABLED is false — confirmations are only logged';
    if (isProduction) fail(message);
    else warn(message);
  }

  const storage = process.env.STORAGE_DRIVER ?? 'local';
  if (storage === 'local') {
    const message = 'STORAGE_DRIVER=local writes to the app filesystem and is not durable';
    if (isProduction) fail(message);
    else warn(message);
  } else {
    pass(`storage driver is ${storage}`);
    if (storage === 's3') {
      requireEnv('S3_BUCKET');
      requireEnv('S3_ACCESS_KEY_ID');
      requireEnv('S3_SECRET_ACCESS_KEY');
    }
    if (storage === 'cloudinary') {
      requireEnv('CLOUDINARY_CLOUD_NAME');
      requireEnv('CLOUDINARY_API_KEY');
      requireEnv('CLOUDINARY_API_SECRET');
    }
  }

  if (process.env.ERROR_WEBHOOK_URL) pass('ERROR_WEBHOOK_URL is set');
  else warn('ERROR_WEBHOOK_URL is not set — errors only go to stderr');
}

function checkSellerIdentity() {
  const entity = process.env.GST_LEGAL_ENTITY_NAME ?? '';
  const gstin = process.env.GST_GSTIN ?? '';

  if (!entity || entity.includes('[LEGAL_ENTITY_NAME]')) {
    if (isProduction) fail('GST_LEGAL_ENTITY_NAME is still a placeholder — invoices would be invalid');
    else warn('GST_LEGAL_ENTITY_NAME is a placeholder');
  } else {
    pass('GST_LEGAL_ENTITY_NAME is set');
  }

  if (!gstin || gstin.includes('[GSTIN]')) {
    if (isProduction) fail('GST_GSTIN is still a placeholder — invoices would be invalid');
    else warn('GST_GSTIN is a placeholder');
  } else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
    warn('GST_GSTIN does not match the 15-character format', gstin);
  } else {
    pass('GST_GSTIN is well-formed');
  }
}

async function main() {
  console.log(`\nDeployment preflight${isProduction ? ' (production)' : ''}\n`);

  requireEnv('AUTH_SECRET', { minLength: 32 });
  if (process.env.AUTH_SECRET && /^replace-me|change-me|dev-only|local-verify/i.test(process.env.AUTH_SECRET)) {
    fail('AUTH_SECRET is a development value', 'generate a fresh 32-byte secret');
  }

  checkUrl();
  checkSellerIdentity();
  checkIntegrations();
  optionalEnv('NODE_ENV');
  await checkDatabase();

  const section = (title, items, symbol) => {
    if (items.length === 0) return;
    console.log(`${title}`);
    for (const item of items) console.log(`  ${symbol} ${item}`);
    console.log('');
  };

  section('PASS', passes, '✓');
  section('WARN', warnings, '!');
  section('FAIL', failures, '✗');

  if (failures.length > 0) {
    console.log(`Preflight FAILED with ${failures.length} blocking issue(s).\n`);
    process.exit(1);
  }

  console.log(
    warnings.length > 0
      ? `Preflight passed with ${warnings.length} warning(s).\n`
      : 'Preflight passed.\n',
  );
}

main().catch((error) => {
  console.error('Preflight crashed:', error);
  process.exit(1);
});
