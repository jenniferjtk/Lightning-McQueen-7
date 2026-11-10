import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  for (const fn of [db.getConnection, db.beginTransaction, db.commit, db.rollback, db.release]) fn.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const SPONSOR_ID = users.sponsor.sponsor_id;
const hardDrive = { id: 9, title: 'Hard Drive', price: 64, description: 'Stores 2TB', category: 'electronics', image: 'https://img/9.png' };
// $64 at $0.01 per point.
const COST = 6400;
const savedAddress = {
  shipping_address: '1 Main St', shipping_city: 'Clemson', shipping_state: 'SC',
  shipping_postal_code: '29631', shipping_country: 'USA',
};

const providerReturns = (body) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const calls = (text) => db.execute.mock.calls.filter(([sql]) => sql.includes(text));

// The queries checkout makes, in order. Override any of them per test.
const checkoutQueries = ({ approved = true, inCatalog = true, address = savedAddress, stock = 3, balance = 7000 } = {}) => [
  roleLookup,
  ['FROM driver_applications WHERE driver_user_id = ?', approved ? [{ application_id: 1 }] : []],
  ['JOIN sponsors s ON s.sponsor_id = sc.sponsor_id', inCatalog ? [{ sponsor_name: 'Acme Trucking', point_conversion_rate: '0.0100' }] : []],
  ['FROM users u WHERE u.user_id = ?', [address]],
  ['UPDATE cached_products', { affectedRows: 1 }],
  ['SELECT stock_quantity FROM sponsor_catalog', [{ stock_quantity: stock }]],
  ['AND r.sponsor_id = ?', [{ points: String(balance) }]],
  ['UPDATE sponsor_catalog SET stock_quantity', { affectedRows: 1 }],
  ['INSERT INTO orders', { insertId: 42 }],
];
const order = { sponsorId: SPONSOR_ID, productId: 9, expectedPointCost: COST };

describe('POST /api/orders', () => {
  it('places the order, spends the points, and takes one unit of stock', async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries());

    const res = await agent.post('/api/orders').send(order).expect(201);

    expect(res.body).toMatchObject({
      order: {
        orderId: 42, sponsorId: SPONSOR_ID, sponsorName: 'Acme Trucking', productId: 9,
        productTitle: 'Hard Drive', unitPrice: 64, pointCost: COST, status: 'pending',
      },
      pointBalance: 7000 - COST,
      stockQuantity: 2,
    });
    expect(Number.isNaN(Date.parse(res.body.order.createdAt))).toBe(false);
    // Price, title and shipping address are copied onto the order row.
    expect(calls('INSERT INTO orders')[0][1]).toEqual([
      users.driver.user_id, SPONSOR_ID, 9, 'Hard Drive', 64, COST, '1 Main St', 'Clemson', 'SC', '29631', 'USA',
    ]);
    expect(calls('UPDATE sponsor_catalog SET stock_quantity')[0][1]).toEqual([SPONSOR_ID, 9]);
    // Balance is read inside the transaction, after the driver row is locked.
    expect(calls('FOR UPDATE')[0][0]).toContain('FROM users WHERE user_id = ?');
    expect(calls('AND r.sponsor_id = ?')[0][1]).toEqual([users.driver.user_id, SPONSOR_ID, users.driver.user_id, SPONSOR_ID]);
    expect(db.beginTransaction).toHaveBeenCalledTimes(1);
    expect(db.commit).toHaveBeenCalledTimes(1);
    expect(db.rollback).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it('leaves stock alone when the sponsor has not set a stock count', async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries({ stock: null }));

    const res = await agent.post('/api/orders').send(order).expect(201);

    expect(res.body.stockQuantity).toBeNull();
    expect(calls('UPDATE sponsor_catalog SET stock_quantity')).toHaveLength(0);
  });

  it('refuses with a clear message when the driver does not have enough points', async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries({ balance: 100 }));

    const res = await agent.post('/api/orders').send(order).expect(409);

    expect(res.body).toEqual({
      message: 'You need 6,300 more points to order this item.',
      code: 'INSUFFICIENT_POINTS',
      pointBalance: 100,
      pointCost: COST,
    });
    expect(calls('INSERT INTO orders')).toHaveLength(0);
    expect(calls('UPDATE sponsor_catalog SET stock_quantity')).toHaveLength(0);
    expect(db.rollback).toHaveBeenCalledTimes(1);
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it('charges nothing when the live price no longer matches what the driver confirmed', async () => {
    providerReturns({ ...hardDrive, price: 70 });
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries());

    const res = await agent.post('/api/orders').send(order).expect(409);

    expect(res.body).toMatchObject({ code: 'PRICE_CHANGED', pointCost: 7000, price: 70 });
    expect(res.body.message).toBe('The price changed to 7,000 points. Review the new cost and confirm again.');
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(calls('INSERT INTO orders')).toHaveLength(0);
    // The cached copy is still updated so the catalog shows the new price.
    expect(calls('UPDATE cached_products')[0][1]).toContain(70);
  });

  it('refuses an out-of-stock item', async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries({ stock: 0 }));

    const res = await agent.post('/api/orders').send(order).expect(409);

    expect(res.body).toMatchObject({ code: 'OUT_OF_STOCK', message: 'This item is out of stock.' });
    expect(calls('INSERT INTO orders')).toHaveLength(0);
    expect(db.rollback).toHaveBeenCalledTimes(1);
  });

  it('requires a saved shipping address before contacting the provider', async () => {
    const fetchMock = providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries({ address: { ...savedAddress, shipping_address: null } }));

    const res = await agent.post('/api/orders').send(order).expect(400);

    expect(res.body.code).toBe('ADDRESS_REQUIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only lets a driver order from sponsors that approved them', async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries({ approved: false }));

    await agent.post('/api/orders').send(order).expect(403);

    expect(calls('JOIN sponsors s ON s.sponsor_id = sc.sponsor_id')).toHaveLength(0);
  });

  it('returns 404 for a product the sponsor does not offer', async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries({ inCatalog: false }));

    await agent.post('/api/orders').send(order).expect(404);
  });

  it('returns 502 and writes nothing when the provider is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const agent = await signIn(app, users.driver);
    mockQueries(checkoutQueries());

    const res = await agent.post('/api/orders').send(order).expect(502);

    expect(res.body.code).toBe('CATALOG_UNAVAILABLE');
    expect(calls('INSERT INTO orders')).toHaveLength(0);
  });

  it('rolls back and releases the connection when the insert fails', async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.driver);
    mockQueries([['INSERT INTO orders', () => { throw new Error('deadlock'); }], ...checkoutQueries()]);

    await agent.post('/api/orders').send(order).expect(500);

    expect(db.rollback).toHaveBeenCalledTimes(1);
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it('validates the request body', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent.post('/api/orders').send({ sponsorId: 'x', productId: 9, expectedPointCost: COST }).expect(400);
    await agent.post('/api/orders').send({ sponsorId: SPONSOR_ID, productId: 9 }).expect(400);
  });

  it('is for drivers only', async () => {
    await request(app).post('/api/orders').send(order).expect(401);
    for (const user of [users.sponsor, users.admin]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.post('/api/orders').send(order).expect(403);
    }
  });
});

describe('GET /api/orders', () => {
  it('lists the signed-in driver\'s orders, newest first, with the order date', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM orders o', [{
        order_id: 42, sponsor_id: SPONSOR_ID, sponsor_name: 'Acme Trucking', product_id: 9, product_title: 'Hard Drive',
        unit_price: '64.00', point_cost: 6400, status: 'pending', created_at: '2026-11-04T15:30:00.000Z',
      }]],
    ]);

    const res = await agent.get('/api/orders').expect(200);

    expect(res.body.orders).toEqual([{
      orderId: 42, sponsorId: SPONSOR_ID, sponsorName: 'Acme Trucking', productId: 9, productTitle: 'Hard Drive',
      unitPrice: 64, pointCost: 6400, status: 'pending', createdAt: '2026-11-04T15:30:00.000Z',
    }]);
    const [sql, params] = calls('FROM orders o')[0];
    expect(params).toEqual([users.driver.user_id]);
    expect(sql).toContain('ORDER BY o.created_at DESC');
  });

  it('is for drivers only', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);
    await agent.get('/api/orders').expect(403);
  });
});

describe('POST /api/orders/:orderId/cancel', () => {
  const pendingOrder = {
    order_id: 42, driver_user_id: users.driver.user_id, sponsor_id: SPONSOR_ID, product_id: 9,
    product_title: 'Hard Drive', unit_price: '64.00', point_cost: 6400, status: 'pending',
    created_at: '2026-11-04T15:30:00.000Z', sponsor_name: 'Acme Trucking',
  };

  it('cancels its own pending order once, restores stock, and returns points', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM orders o JOIN sponsors s', [pendingOrder]],
      ["UPDATE orders SET status = 'canceled'", { affectedRows: 1 }],
      ['UPDATE sponsor_catalog SET stock_quantity = stock_quantity + 1', { affectedRows: 1 }],
      ['SELECT stock_quantity FROM sponsor_catalog', [{ stock_quantity: 4 }]],
      ['AS points', [{ points: 600 }]],
    ]);

    const response = await agent.post('/api/orders/42/cancel').expect(200);

    expect(response.body).toEqual({
      order: {
        orderId: 42, sponsorId: SPONSOR_ID, sponsorName: 'Acme Trucking', productId: 9,
        productTitle: 'Hard Drive', unitPrice: 64, pointCost: 6400, status: 'canceled',
        createdAt: pendingOrder.created_at,
      },
      pointBalance: 600,
      stockQuantity: 4,
    });
    expect(db.commit).toHaveBeenCalledOnce();
    expect(db.rollback).not.toHaveBeenCalled();
    expect(calls("UPDATE orders SET status = 'canceled'")).toHaveLength(1);
    expect(calls('UPDATE sponsor_catalog SET stock_quantity = stock_quantity + 1')).toHaveLength(1);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('does not refund or restore stock for a non-pending order', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, ['FROM orders o JOIN sponsors s', [{ ...pendingOrder, status: 'shipped' }]]]);

    const response = await agent.post('/api/orders/42/cancel').expect(409);

    expect(response.body.code).toBe('ORDER_NOT_CANCELLABLE');
    expect(calls("UPDATE orders SET status = 'canceled'")).toHaveLength(0);
    expect(calls('UPDATE sponsor_catalog SET stock_quantity = stock_quantity + 1')).toHaveLength(0);
    expect(db.rollback).toHaveBeenCalledOnce();
    expect(db.commit).not.toHaveBeenCalled();
  });

  it('does not let a driver cancel someone else\'s order', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, ['FROM orders o JOIN sponsors s', []]]);

    await agent.post('/api/orders/42/cancel').expect(404, { message: 'Order not found.' });
    expect(calls("UPDATE orders SET status = 'canceled'")).toHaveLength(0);
  });

  it('requires authentication and is driver-only', async () => {
    await request(app).post('/api/orders/42/cancel').expect(401);
    for (const user of [users.sponsor, users.admin]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.post('/api/orders/42/cancel').expect(403);
    }
  });
});
