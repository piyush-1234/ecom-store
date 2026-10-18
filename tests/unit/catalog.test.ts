import { describe, expect, it } from 'vitest';
import { buildFilterQuery, parseCatalogueFilters } from '@/lib/validators/catalog';

describe('parseCatalogueFilters', () => {
  it('returns defaults for an empty query', () => {
    const filters = parseCatalogueFilters({});
    expect(filters).toEqual({
      sizes: undefined,
      colors: undefined,
      fits: undefined,
      minPricePaise: undefined,
      maxPricePaise: undefined,
      sort: 'featured',
      page: 1,
      q: undefined,
    });
  });

  it('parses a comma-separated size list', () => {
    const filters = parseCatalogueFilters({ size: 'M,L,XL' });
    expect(filters.sizes).toEqual(['M', 'L', 'XL']);
  });

  it('parses repeated params and de-duplicates', () => {
    const filters = parseCatalogueFilters({ size: ['M', 'M', 'L'] });
    expect(filters.sizes).toEqual(['M', 'L']);
  });

  it('converts rupee price filters to paise', () => {
    const filters = parseCatalogueFilters({ min: '500', max: '2000' });
    expect(filters.minPricePaise).toBe(50_000);
    expect(filters.maxPricePaise).toBe(200_000);
  });

  it('swaps an inverted price range instead of returning nothing', () => {
    const filters = parseCatalogueFilters({ min: '2000', max: '500' });
    expect(filters.minPricePaise).toBe(50_000);
    expect(filters.maxPricePaise).toBe(200_000);
  });

  it('accepts a valid sort and page', () => {
    const filters = parseCatalogueFilters({ sort: 'price_asc', page: '3' });
    expect(filters.sort).toBe('price_asc');
    expect(filters.page).toBe(3);
  });

  it('falls back to defaults for an unknown sort', () => {
    const filters = parseCatalogueFilters({ sort: 'cheapest' });
    expect(filters.sort).toBe('featured');
    expect(filters.page).toBe(1);
  });

  it('falls back to defaults for an invalid page rather than throwing', () => {
    const filters = parseCatalogueFilters({ page: '-4' });
    expect(filters.page).toBe(1);
  });

  it('trims and keeps the search term', () => {
    const filters = parseCatalogueFilters({ q: '  oversized tee ' });
    expect(filters.q).toBe('oversized tee');
  });

  it('ignores an empty search term', () => {
    const filters = parseCatalogueFilters({ q: '   ' });
    expect(filters.q).toBeUndefined();
  });
});

describe('buildFilterQuery', () => {
  it('builds a query string from scratch', () => {
    const query = buildFilterQuery({}, { size: 'M,L' });
    expect(query).toBe('?size=M%2CL');
  });

  it('preserves untouched params', () => {
    const query = buildFilterQuery({ color: 'Black' }, { size: 'M' });
    expect(query).toContain('color=Black');
    expect(query).toContain('size=M');
  });

  it('removes a param when the patch value is undefined', () => {
    const query = buildFilterQuery({ color: 'Black', size: 'M' }, { color: undefined });
    expect(query).not.toContain('color=');
    expect(query).toContain('size=M');
  });

  it('resets pagination when a filter changes', () => {
    const query = buildFilterQuery({ page: '3', color: 'Black' }, { size: 'M' });
    expect(query).not.toContain('page=');
  });

  it('keeps pagination when the patch only sets the page', () => {
    const query = buildFilterQuery({ page: '3', color: 'Black' }, { page: '4' });
    expect(query).toContain('page=4');
    expect(query).not.toContain('page=3');
  });

  it('returns an empty string when nothing remains', () => {
    expect(buildFilterQuery({}, {})).toBe('');
  });
});
