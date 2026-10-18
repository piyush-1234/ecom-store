/**
 * Summarise Lighthouse JSON reports and gate against the Definition of Done.
 *
 * Usage:
 *   node scripts/lighthouse-report.mjs [dir]
 *
 * DoD thresholds (mobile): Performance >= 85, Accessibility >= 90,
 * Best Practices >= 90, SEO >= 95.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? './.lighthouse';

const THRESHOLDS = {
  performance: 85,
  accessibility: 90,
  'best-practices': 90,
  seo: 95,
};

const LABELS = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best Practices',
  seo: 'SEO',
};

function score(category) {
  return category?.score === null || category?.score === undefined
    ? null
    : Math.round(category.score * 100);
}

function main() {
  if (!existsSync(dir)) {
    console.error(`No report directory at ${dir}. Run Lighthouse first.`);
    process.exit(1);
  }

  const files = readdirSync(dir).filter((file) => file.endsWith('.json'));
  if (files.length === 0) {
    console.error(`No JSON reports in ${dir}.`);
    process.exit(1);
  }

  const rows = [];
  const failures = [];

  for (const file of files) {
    const report = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const url = new URL(report.finalUrl ?? report.finalDisplayedUrl ?? 'http://unknown/');
    const row = { page: url.pathname, scores: {}, metrics: {} };

    for (const key of Object.keys(THRESHOLDS)) {
      const value = score(report.categories?.[key]);
      row.scores[key] = value;

      if (value === null) continue;
      if (value < THRESHOLDS[key]) {
        failures.push(`${row.page}: ${LABELS[key]} ${value} < ${THRESHOLDS[key]}`);
      }
    }

    const audit = (id) => report.audits?.[id]?.numericValue;
    row.metrics = {
      lcp: audit('largest-contentful-paint'),
      cls: audit('cumulative-layout-shift'),
      tbt: audit('total-blocking-time'),
      fcp: audit('first-contentful-paint'),
      si: audit('speed-index'),
    };

    rows.push(row);
  }

  const pad = (value, width) => String(value).padEnd(width);

  console.log('\nLighthouse (mobile, simulated throttling)\n');
  console.log(
    pad('Page', 28) +
      pad('Perf', 6) +
      pad('A11y', 6) +
      pad('BP', 6) +
      pad('SEO', 6) +
      pad('LCP', 9) +
      pad('CLS', 8) +
      'TBT',
  );
  console.log('-'.repeat(80));

  for (const row of rows) {
    const fmt = (value) => (value === null || value === undefined ? '—' : value);
    console.log(
      pad(row.page, 28) +
        pad(fmt(row.scores.performance), 6) +
        pad(fmt(row.scores.accessibility), 6) +
        pad(fmt(row.scores['best-practices']), 6) +
        pad(fmt(row.scores.seo), 6) +
        pad(`${Math.round(fmt(row.metrics.lcp) ?? 0)}ms`, 9) +
        pad((row.metrics.cls ?? 0).toFixed(3), 8) +
        `${Math.round(fmt(row.metrics.tbt) ?? 0)}ms`,
    );
  }

  console.log(`\nThresholds: ${Object.entries(THRESHOLDS).map(([k, v]) => `${LABELS[k]} >= ${v}`).join(', ')}`);

  if (failures.length > 0) {
    console.log(`\nFAIL — ${failures.length} category score(s) below the Definition of Done:`);
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log('');
    process.exit(1);
  }

  console.log('\nPASS — every category meets the Definition of Done.\n');
}

main();
