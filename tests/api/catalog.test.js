import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const SPONSOR_ID = users.sponsor.sponsor_id;
const OTHER_SPONSOR_ID = 11;

const rawProducts = [
  { id: 1, title: 'Backpack', price: 109.95, description: 'Carries a laptop', category: "men's clothing", image: 'https://img/1.png' },
  { id: 9, title: 'Hard Drive', price: 64, description: 'Stores 2TB', category: 'electronics', image: 'https://img/9.png' },
];
const cachedRow = (raw, extra = {}) => ({
  product_id: raw.id, title: raw.title, price: raw.price.toFixed(2), description: raw.description,
  category: raw.category, image_url: raw.image, ...extra,
});

const freshCache = ['TIMESTAMPDIFF', [{ product_count: 20, age_seconds: 60 }]];
const staleCache = ['TIMESTAMPDIFF', [{ product_count: 20, age_seconds: 60 * 60 }]];
const emptyCache = ['TIMESTAMPDIFF', [{ product_count: 0, age_seconds: null }]];
const upsert = ['INSERT INTO cached_products', { affectedRows: 2 }];

const providerReturns = (body) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const providerDown = () => {
  const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const calls = (text) => db.execute.mock.calls.filter(([sql]) => sql.includes(text));

describe('catalog cache', () => {
  it('serves a fresh cache without calling Fake Store', async () => {
    const fetchMock = providerReturns(rawProducts);
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      freshCache,
      ['LEFT JOIN sponsor_catalog', [cachedRow(rawProducts[0], { in_catalog: 1, category_tag: 'Bags' }), cachedRow(rawProducts[1], { in_catalog: 0 })]],
      ['SELECT DISTINCT category', [{ category: 'electronics' }, { category: "men's clothing" }]],
    ]);

    const res = await agent.get('/api/catalog/products').expect(200);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls('INSERT INTO cached_products')).toHaveLength(0);
    expect(res.body.stale).toBe(false);
    expect(res.body.categories).toEqual(['electronics', "men's clothing"]);
    expect(res.body.products).toEqual([
      { productId: 1, title: 'Backpack', price: 109.95, description: 'Carries a laptop', category: "men's clothing", imageUrl: 'https://img/1.png', inCatalog: true, categoryTag: 'Bags' },
      { productId: 9, title: 'Hard Drive', price: 64, description: 'Stores 2TB', category: 'electronics', imageUrl: 'https://img/9.png', inCatalog: false, categoryTag: null },
    ]);
    // inCatalog is computed for the signed-in sponsor only.
    expect(calls('LEFT JOIN sponsor_catalog')[0][1][0]).toBe(SPONSOR_ID);
  });

  it('refetches from Fake Store and writes the mapped products when the cache is stale', async () => {
    const fetchMock = providerReturns(rawProducts);
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, staleCache, upsert, ['LEFT JOIN sponsor_catalog', []], ['SELECT DISTINCT category', []]]);

    await agent.get('/api/catalog/products').expect(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [sql, params] = calls('INSERT INTO cached_products')[0];
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(params).toEqual([
      1, 'Backpack', 109.95, 'Carries a laptop', "men's clothing", 'https://img/1.png',
      9, 'Hard Drive', 64, 'Stores 2TB', 'electronics', 'https://img/9.png',
    ]);
  });

  it('falls back to the stale cache and says so when Fake Store is unreachable', async () => {
    providerDown();
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, staleCache, ['LEFT JOIN sponsor_catalog', [cachedRow(rawProducts[0], { in_catalog: 0 })]], ['SELECT DISTINCT category', []]]);

    const res = await agent.get('/api/catalog/products').expect(200);

    expect(res.body.stale).toBe(true);
    expect(res.body.products).toHaveLength(1);
  });

  it('returns a clear 502 rather than a 500 when Fake Store is down and nothing is cached', async () => {
    providerDown();
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, emptyCache]);

    const res = await agent.get('/api/catalog/products').expect(502);

    expect(res.body).toEqual({
      message: 'The product catalog is unavailable right now. Please try again in a few minutes.',
      code: 'CATALOG_UNAVAILABLE',
    });
  });

  it('filters by search text and category with LIKE wildcards escaped', async () => {
    providerReturns(rawProducts);
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, freshCache, ['LEFT JOIN sponsor_catalog', []], ['SELECT DISTINCT category', []]]);

    await agent.get('/api/catalog/products').query({ search: '100%', category: 'electronics' }).expect(200);

    const [sql, params] = calls('LEFT JOIN sponsor_catalog')[0];
    expect(sql).toContain('p.title LIKE ?');
    expect(params).toEqual([SPONSOR_ID, '%100\\%%', '%100\\%%', 'electronics']);
  });

  it('does not let drivers browse the full Fake Store list', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent.get('/api/catalog/products').expect(403);
  });
});

describe('sponsor catalog curation', () => {
  it('adds a cached product to the sponsor\'s own catalog with a category tag', async () => {
    providerReturns(rawProducts);
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      freshCache,
      ['WHERE p.product_id = ?', [cachedRow(rawProducts[1])]],
      ['INSERT INTO sponsor_catalog', { affectedRows: 1 }],
    ]);

    const res = await agent.post(`/api/sponsors/${SPONSOR_ID}/catalog`).send({ productId: 9, categoryTag: '  Tech  ' }).expect(201);

    expect(res.body.product).toMatchObject({ productId: 9, title: 'Hard Drive', categoryTag: 'Tech' });
    expect(calls('INSERT INTO sponsor_catalog')[0][1]).toEqual([SPONSOR_ID, 9, 'Tech']);
  });

  it('rejects a product id that is not in the Fake Store catalog', async () => {
    providerReturns(rawProducts);
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, freshCache, ['WHERE p.product_id = ?', []]]);

    await agent.post(`/api/sponsors/${SPONSOR_ID}/catalog`).send({ productId: 999 }).expect(404);
    expect(calls('INSERT INTO sponsor_catalog')).toHaveLength(0);
  });

  it('reports a product that is already in the catalog as a conflict', async () => {
    providerReturns(rawProducts);
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      freshCache,
      ['WHERE p.product_id = ?', [cachedRow(rawProducts[1])]],
      ['INSERT INTO sponsor_catalog', () => { throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }); }],
    ]);

    await agent.post(`/api/sponsors/${SPONSOR_ID}/catalog`).send({ productId: 9 }).expect(409);
  });

  it('removes a product from the sponsor\'s own catalog', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, ['DELETE FROM sponsor_catalog', { affectedRows: 1 }]]);

    await agent.delete(`/api/sponsors/${SPONSOR_ID}/catalog/9`).expect(204);
    expect(calls('DELETE FROM sponsor_catalog')[0][1]).toEqual([SPONSOR_ID, 9]);
  });

  it('returns 404 when removing a product that is not in the catalog', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, ['DELETE FROM sponsor_catalog', { affectedRows: 0 }]]);

    await agent.delete(`/api/sponsors/${SPONSOR_ID}/catalog/9`).expect(404);
  });

  it('updates a product\'s category tag, and a blank tag clears it', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, ['UPDATE sponsor_catalog', { affectedRows: 1 }]]);

    await agent.patch(`/api/sponsors/${SPONSOR_ID}/catalog/9`).send({ categoryTag: '' }).expect(200, { productId: 9, categoryTag: null });
    expect(calls('UPDATE sponsor_catalog')[0][1]).toEqual([null, SPONSOR_ID, 9]);
  });

  it('blocks a sponsor from adding to, retagging, or removing from another sponsor\'s catalog', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    const add = await agent.post(`/api/sponsors/${OTHER_SPONSOR_ID}/catalog`).send({ productId: 9 }).expect(403);
    await agent.patch(`/api/sponsors/${OTHER_SPONSOR_ID}/catalog/9`).send({ categoryTag: 'x' }).expect(403);
    await agent.delete(`/api/sponsors/${OTHER_SPONSOR_ID}/catalog/9`).expect(403);

    expect(add.body.message).toBe('This catalog belongs to a different sponsor.');
    expect(calls('sponsor_catalog')).toHaveLength(0);
  });

  it('blocks drivers from curating any catalog', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent.post(`/api/sponsors/${SPONSOR_ID}/catalog`).send({ productId: 9 }).expect(403);
  });

  it('validates the product id and tag length', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    await agent.post(`/api/sponsors/${SPONSOR_ID}/catalog`).send({ productId: 'abc' }).expect(400);
    await agent.post(`/api/sponsors/${SPONSOR_ID}/catalog`).send({ productId: 9, categoryTag: 'x'.repeat(101) }).expect(400);
  });
});

describe('driver catalog view', () => {
  const approvedFor = (...sponsorIds) => [
    'FROM driver_applications WHERE driver_user_id = ?',
    ([, sponsorId]) => (sponsorIds.includes(sponsorId) ? [{ application_id: 1 }] : []),
  ];
  const sponsorRow = ['FROM sponsors WHERE sponsor_id = ?', ([id]) => [{ sponsor_id: id, name: `Sponsor ${id}`, point_conversion_rate: '0.0100' }]];

  it('returns only the requested sponsor\'s selected products, priced in that sponsor\'s points', async () => {
    providerReturns(rawProducts);
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      approvedFor(SPONSOR_ID, OTHER_SPONSOR_ID),
      sponsorRow,
      freshCache,
      ['ORDER BY COALESCE(sc.category_tag', ([id]) => (id === SPONSOR_ID
        ? [cachedRow(rawProducts[1], { category_tag: 'Tech' })]
        : [cachedRow(rawProducts[0], { category_tag: null })])],
    ]);

    const first = await agent.get(`/api/sponsors/${SPONSOR_ID}/catalog`).expect(200);
    const second = await agent.get(`/api/sponsors/${OTHER_SPONSOR_ID}/catalog`).expect(200);

    expect(first.body).toMatchObject({ sponsorId: SPONSOR_ID, sponsorName: `Sponsor ${SPONSOR_ID}`, pointConversionRate: 0.01, stale: false });
    expect(first.body.products).toEqual([{
      productId: 9, title: 'Hard Drive', price: 64, description: 'Stores 2TB', category: 'electronics',
      imageUrl: 'https://img/9.png', categoryTag: 'Tech', displayCategory: 'Tech', pointCost: 6400,
    }]);
    expect(second.body.products.map((product) => product.productId)).toEqual([1]);
    expect(second.body.products[0]).toMatchObject({ displayCategory: "men's clothing", pointCost: 10995 });
    // The list query reads sponsor_catalog for that one sponsor, never the full product table.
    const listQueries = calls('ORDER BY COALESCE(sc.category_tag');
    expect(listQueries.map(([sql, params]) => [sql.includes('FROM sponsor_catalog sc'), params])).toEqual([[true, [SPONSOR_ID]], [true, [OTHER_SPONSOR_ID]]]);
  });

  it('blocks a driver from a sponsor that has not approved them', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, approvedFor(SPONSOR_ID)]);

    await agent.get(`/api/sponsors/${OTHER_SPONSOR_ID}/catalog`).expect(403);
    expect(calls('sponsor_catalog')).toHaveLength(0);
  });

  it('lets a sponsor view its own catalog but not another sponsor\'s', async () => {
    providerReturns(rawProducts);
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, sponsorRow, freshCache, ['ORDER BY COALESCE(sc.category_tag', []]]);

    await agent.get(`/api/sponsors/${SPONSOR_ID}/catalog`).expect(200);
    await agent.get(`/api/sponsors/${OTHER_SPONSOR_ID}/catalog`).expect(403);
  });

  it('requires a session', async () => {
    await request(app).get(`/api/sponsors/${SPONSOR_ID}/catalog`).expect(401);
  });
});

describe('live product check before checkout', () => {
  const catalogEntry = ['WHERE sc.sponsor_id = ? AND sc.product_id = ?', [cachedRow(rawProducts[1], { category_tag: null, point_conversion_rate: '0.0100' })]];
  const approved = ['FROM driver_applications WHERE driver_user_id = ?', [{ application_id: 1 }]];

  it('re-fetches the product live and reports a price change from the cached copy', async () => {
    const fetchMock = providerReturns({ ...rawProducts[1], price: 70 });
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, approved, catalogEntry, ['UPDATE cached_products', { affectedRows: 1 }]]);

    const res = await agent.get(`/api/sponsors/${SPONSOR_ID}/catalog/9/live`).expect(200);

    expect(fetchMock.mock.calls[0][0]).toBe('https://fakestoreapi.com/products/9');
    expect(res.body).toMatchObject({ available: true, cachedPrice: 64, priceChanged: true });
    expect(res.body.product).toMatchObject({ productId: 9, price: 70, pointCost: 7000 });
    const [sql, params] = calls('UPDATE cached_products')[0];
    expect(sql).not.toContain('fetched_at');
    expect(params).toEqual(['Hard Drive', 70, 'Stores 2TB', 'electronics', 'https://img/9.png', 9]);
  });

  it('reports a product the provider no longer has as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, approved, catalogEntry]);

    const res = await agent.get(`/api/sponsors/${SPONSOR_ID}/catalog/9/live`).expect(200);

    expect(res.body).toEqual({ available: false, cachedPrice: 64, priceChanged: false, product: null });
  });

  it('returns 502, not a stale price, when Fake Store is unreachable at checkout', async () => {
    providerDown();
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, approved, catalogEntry]);

    const res = await agent.get(`/api/sponsors/${SPONSOR_ID}/catalog/9/live`).expect(502);

    expect(res.body.code).toBe('CATALOG_UNAVAILABLE');
  });

  it('only checks products in that sponsor\'s catalog', async () => {
    const fetchMock = providerReturns(rawProducts[1]);
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, approved, ['WHERE sc.sponsor_id = ? AND sc.product_id = ?', []]]);

    await agent.get(`/api/sponsors/${SPONSOR_ID}/catalog/9/live`).expect(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
