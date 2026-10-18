/**
 * Load test (no dependencies).
 *
 * Fires N concurrent workers at a set of read-heavy endpoints for a fixed duration
 * and reports latency percentiles and error rates. Intended for a local smoke-level
 * check — not a substitute for a real load test against production infrastructure.
 *
 * Usage:
 *   node scripts/load-test.mjs [baseUrl] [seconds] [concurrency]
 *   node scripts/load-test.mjs http://127.0.0.1:3300 10 20
 *
 * Exits non-zero if the error rate exceeds 1% or p95 exceeds the budget.
 */

const BASE = process.argv[2] ?? process.env.LOAD_BASE_URL ?? 'http://127.0.0.1:3300';
const SECONDS = Number(process.argv[3] ?? 10);
const CONCURRENCY = Number(process.argv[4] ?? 20);

/** Read-only paths; a real basket flow would be exercised separately. */
const PATHS = ['/', '/t-shirts', '/jeans', '/size-chart', '/search?q=jeans'];

const P95_BUDGET_MS = 1500;
const ERROR_RATE_BUDGET = 0.01;

const latencies = [];
const statusCounts = new Map();
let inFlight = 0;
const deadline = Date.now() + SECONDS * 1000;

async function worker(index) {
  let counter = index;

  while (Date.now() < deadline) {
    const path = PATHS[counter % PATHS.length];
    counter += 1;

    const started = performance.now();
    try {
      const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
      // Consume the body so the connection is reusable.
      await response.text();
      statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
    } catch {
      statusCounts.set('network_error', (statusCounts.get('network_error') ?? 0) + 1);
    } finally {
      latencies.push(performance.now() - started);
      inFlight = Math.max(0, inFlight - 1);
    }
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function main() {
  console.log(`\nLoad test: ${BASE}`);
  console.log(`  duration ${SECONDS}s · concurrency ${CONCURRENCY} · paths ${PATHS.length}\n`);

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => worker(index)));
  const elapsed = (Date.now() - started) / 1000;

  const sorted = [...latencies].sort((a, b) => a - b);
  const total = sorted.length;
  const errors = statusCounts.get('network_error') ?? 0;
  const serverErrors = [...statusCounts.entries()]
    .filter(([status]) => typeof status === 'number' && status >= 500)
    .reduce((sum, [, count]) => sum + count, 0);
  const errorRate = total === 0 ? 1 : (errors + serverErrors) / total;

  console.log(`  requests   ${total}  (${(total / elapsed).toFixed(1)} req/s)`);
  console.log(`  p50        ${percentile(sorted, 50).toFixed(0)} ms`);
  console.log(`  p95        ${percentile(sorted, 95).toFixed(0)} ms`);
  console.log(`  p99        ${percentile(sorted, 99).toFixed(0)} ms`);
  console.log(`  max        ${(sorted[sorted.length - 1] ?? 0).toFixed(0)} ms`);
  console.log(`  statuses   ${[...statusCounts.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  console.log(`  error rate ${(errorRate * 100).toFixed(2)}%`);

  const p95 = percentile(sorted, 95);
  const failures = [];
  if (p95 > P95_BUDGET_MS) failures.push(`p95 ${p95.toFixed(0)}ms exceeds ${P95_BUDGET_MS}ms budget`);
  if (errorRate > ERROR_RATE_BUDGET) failures.push(`error rate ${(errorRate * 100).toFixed(2)}% exceeds 1%`);

  if (failures.length > 0) {
    console.log('\nFAIL\n' + failures.map((f) => `  - ${f}`).join('\n') + '\n');
    process.exit(1);
  }

  console.log('\nPASS\n');
}

main().catch((error) => {
  console.error('Load test crashed:', error);
  process.exit(1);
});
