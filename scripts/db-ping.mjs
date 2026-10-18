/**
 * Quick database connectivity + row-count probe.
 * Usage: node scripts/db-ping.mjs
 */
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const { rows } = await client.query(`
    select current_database() as db,
           (select count(*) from "Product")::int  as products,
           (select count(*) from "Variant")::int  as variants,
           (select count(*) from "Order")::int    as orders,
           (select count(*) from "User")::int     as users
  `);
  console.log('DB UP', JSON.stringify(rows[0]));
} catch (error) {
  console.error('DB DOWN:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
