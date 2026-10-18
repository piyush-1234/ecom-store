/**
 * Storefront smoke test against a running server.
 *
 * Verifies that catalogue pages render real data, that filters and pagination are
 * wired, that product structured data is emitted, and that bad URLs 404 instead of
 * 500ing.
 *
 * Usage: node scripts/smoke-store.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';

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

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  console.log(`\nStorefront smoke test against ${BASE}\n`);

  // --- home ---
  const home = await get('/');
  ok('home renders 200', home.status === 200, `status=${home.status}`);
  ok('home shows the brand headline', /Tees and denim/i.test(home.text));
  ok('home links to both categories', home.text.includes('/t-shirts') && home.text.includes('/jeans'));

  // --- category ---
  const tees = await get('/t-shirts');
  ok('t-shirts listing renders 200', tees.status === 200, `status=${tees.status}`);
  ok('listing has products', /\/product\//.test(tees.text));

  const jeans = await get('/jeans');
  ok('jeans listing renders 200', jeans.status === 200, `status=${jeans.status}`);

  // --- extract a product slug from the listing ---
  const slugMatch = tees.text.match(/\/product\/([a-z0-9-]+)/);
  ok('found a product link in the listing', Boolean(slugMatch));
  const slug = slugMatch?.[1];

  if (slug) {
    const pdp = await get(`/product/${slug}`);
    ok('product page renders 200', pdp.status === 200, `status=${pdp.status}`);

    // --- structured data ---
    ok('product emits JSON-LD', pdp.text.includes('application/ld+json'));
    ok('JSON-LD carries INR pricing', /"priceCurrency":"INR"/.test(pdp.text));
    ok('JSON-LD declares a return policy', /hasMerchantReturnPolicy/.test(pdp.text));

    // --- purchase affordances ---
    ok('product page has an add-to-cart control', /Add to cart/i.test(pdp.text));
    ok('product page shows a size selector', /Size<\/h2>|Size chart/i.test(pdp.text));
    ok('product page lists a HSN code', /HSN code/.test(pdp.text));
    ok('product page states country of origin', /Country of origin/i.test(pdp.text));
  }

  // --- filters ---
  const filtered = await get('/t-shirts?size=M&sort=price_asc');
  ok('filtered + sorted listing renders 200', filtered.status === 200, `status=${filtered.status}`);
  ok('active filter is reflected in the UI', /aria-pressed="true"/.test(filtered.text));

  const badFilter = await get('/t-shirts?size=NOPE&min=abc&page=-1');
  ok('garbage filter values do not 500', badFilter.status === 200, `status=${badFilter.status}`);

  // --- search ---
  const search = await get('/search?q=jeans');
  ok('search renders 200', search.status === 200, `status=${search.status}`);
  const emptySearch = await get('/search?q=zzzzzznothing');
  ok('empty search shows a fallback, not a crash', emptySearch.status === 200 && /Nothing matched/.test(emptySearch.text));

  // --- static pages ---
  const sizeChart = await get('/size-chart');
  ok('size chart renders 200', sizeChart.status === 200, `status=${sizeChart.status}`);
  ok('size chart has a waist table', /Waist \(cm\)/.test(sizeChart.text));

  const cart = await get('/cart');
  ok('cart renders 200', cart.status === 200, `status=${cart.status}`);
  ok('empty cart shows an empty state', /Your cart is empty/.test(cart.text));

  // --- SEO infrastructure ---
  const sitemap = await get('/sitemap.xml');
  ok('sitemap renders 200', sitemap.status === 200, `status=${sitemap.status}`);
  ok('sitemap includes products', /\/product\//.test(sitemap.text));
  ok('sitemap includes categories', /\/t-shirts/.test(sitemap.text));

  const robots = await get('/robots.txt');
  ok('robots.txt renders 200', robots.status === 200, `status=${robots.status}`);
  ok('robots points at the sitemap', /Sitemap:/i.test(robots.text));
  ok('robots disallows /account and /cart', /Disallow: \/account/.test(robots.text) && /Disallow: \/cart/.test(robots.text));

  // --- 404 behaviour ---
  const badCategory = await get('/shoes');
  ok('unknown category 404s', badCategory.status === 404, `status=${badCategory.status}`);

  const badProduct = await get('/product/this-does-not-exist');
  ok('unknown product 404s', badProduct.status === 404, `status=${badProduct.status}`);

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    console.log('Failed:\n' + failures.map((f) => `  - ${f}`).join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nStorefront smoke test crashed:', error);
  process.exit(1);
});
