/**
 * Remove test data created by the smoke and E2E suites.
 *
 * The Playwright journey places a REAL order (that is the point — it exercises the
 * whole checkout). Those rows accumulate, and their stock stays consumed. This
 * script deletes test orders and restores the stock they held.
 *
 * Safe by default: prints what it would do. Pass --yes to actually delete.
 *
 *   node scripts/cleanup-test-data.mjs          # dry run
 *   node scripts/cleanup-test-data.mjs --yes    # execute
 */

import { Client } from 'pg';

const EXECUTE = process.argv.includes('--yes');

/** Emails used by the test suites. Real customers must never match these. */
const TEST_EMAIL_PATTERNS = [
  'e2e_%@example.com',
  'smoke_%@example.com',
  'smoke@example.com',
  'coupon_%@example.com',
  'dup_%@example.com',
  'u_%@example.com',
  'm_%@example.com',
  'returns@example.com',
  'ship@example.com',
  'demo@example.com',
];

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log(`\nTest-data cleanup${EXECUTE ? '' : ' (dry run)'}\n`);

  await client.connect();

  const patternClause = TEST_EMAIL_PATTERNS.map((_, index) => `email like $${index + 1}`).join(' or ');

  const orders = await client.query(
    `select o.id, o."orderNumber", o.email, o.status
       from "Order" o
      where ${patternClause}
      order by o."placedAt" desc`,
    TEST_EMAIL_PATTERNS,
  );

  const users = await client.query(
    `select id, email from "User" where ${patternClause}`,
    TEST_EMAIL_PATTERNS,
  );

  console.log(`  test orders : ${orders.rowCount}`);
  console.log(`  test users  : ${users.rowCount}`);

  if (orders.rowCount === 0 && users.rowCount === 0) {
    console.log('\nNothing to clean.\n');
    return;
  }

  // Stock restoration: only for orders that were never restocked (no RTO/cancel path).
  const restockable = await client.query(
    `select oi."variantId", sum(oi.qty)::int as qty
       from "OrderItem" oi
       join "Order" o on o.id = oi."orderId"
      where (${patternClause})
        and o.status not in ('RTO', 'CANCELLED', 'REFUNDED', 'RETURNED')
        and oi."variantId" is not null
      group by oi."variantId"`,
    TEST_EMAIL_PATTERNS,
  );

  const totalUnits = restockable.rows.reduce((sum, row) => sum + row.qty, 0);
  console.log(`  units to restore: ${totalUnits} across ${restockable.rowCount} variant(s)`);

  if (!EXECUTE) {
    console.log('\nDry run — nothing changed. Re-run with --yes to apply.\n');
    return;
  }

  await client.query('begin');
  try {
    for (const row of restockable.rows) {
      await client.query(`update "Variant" set stock = stock + $1 where id = $2`, [
        row.qty,
        row.variantId,
      ]);
    }

    // Order → items/payments/shipments/returns/redemptions cascade from the schema.
    const deletedOrders = await client.query(
      `delete from "Order" where ${patternClause}`,
      TEST_EMAIL_PATTERNS,
    );

    // Carts used by the HTTP suites.
    const deletedCarts = await client.query(
      `delete from "Cart" where "cartToken" like 'smoke-%'
          or "cartToken" like 'cpn-%'
          or "cartToken" like 'ret-%'
          or "cartToken" like 'ship-%'
          or "cartToken" like 'demo-%'`,
    );

    const deletedUsers = await client.query(
      `delete from "User" where ${patternClause}`,
      TEST_EMAIL_PATTERNS,
    );

    await client.query('commit');

    console.log(`\n  orders deleted : ${deletedOrders.rowCount}`);
    console.log(`  carts deleted  : ${deletedCarts.rowCount}`);
    console.log(`  users deleted  : ${deletedUsers.rowCount}`);
    console.log(`  stock restored : ${totalUnits} unit(s)\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('Cleanup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
