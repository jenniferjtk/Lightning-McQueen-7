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
const DRIVER_ID = users.driver.user_id;
const COST = 6400;
const hardDrive = { id: 9, title: 'Hard Drive', price: 64, description: 'Stores 2TB', category: 'electronics', image: 'https://img/9.png' };
const savedAddress = {
  shipping_address: '1 Main St', shipping_city: 'Clemson', shipping_state: 'SC',
  shipping_postal_code: '29631', shipping_country: 'USA',
};
const providerReturns = (body) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
const calls = (text) => db.execute.mock.calls.filter(([sql]) => sql.includes(text));

const onBehalfQueries = ({ approved = true, address = savedAddress, stock = 3, balance = 7000 } = {}) => [
  ['a.driver_user_id = ? AND a.sponsor_id = ?', approved ? [{ first_name: 'Dana', last_name: 'Driver', email: 'driver@test.com' }] : []],
  roleLookup,
  ['JOIN sponsors s ON s.sponsor_id = sc.sponsor_id', [{ sponsor_name: 'Acme Trucking', point_conversion_rate: '0.0100' }]],
  ['FROM users u WHERE u.user_id = ?', [address]],
  ['UPDATE cached_products', { affectedRows: 1 }],
  ['SELECT stock_quantity FROM sponsor_catalog', [{ stock_quantity: stock }]],
  ['AND r.sponsor_id = ?', [{ points: String(balance) }]],
  ['UPDATE sponsor_catalog SET stock_quantity', { affectedRows: 1 }],
  ['INSERT INTO orders', { insertId: 77 }],
];
const body = { driverId: DRIVER_ID, productId: 9, expectedPointCost: COST };

describe('POST /api/sponsor/orders', () => {
  it("orders from the sponsor's own catalog with the chosen driver's points", async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.sponsor);
    mockQueries(onBehalfQueries());

    const res = await agent.post('/api/sponsor/orders').send({ ...body, sponsorId: 999 }).expect(201);

    expect(res.body).toMatchObject({
      order: { orderId: 77, sponsorId: SPONSOR_ID, productTitle: 'Hard Drive', pointCost: COST, status: 'pending' },
      pointBalance: 7000 - COST,
      stockQuantity: 2,
      driver: { id: DRIVER_ID, name: 'Dana Driver' },
    });
    // The sponsor comes from the session, never the request body.
    expect(calls('a.driver_user_id = ? AND a.sponsor_id = ?')[0][1]).toEqual([DRIVER_ID, SPONSOR_ID]);
    expect(calls('INSERT INTO orders')[0][1].slice(0, 6)).toEqual([DRIVER_ID, SPONSOR_ID, 9, 'Hard Drive', 64, COST]);
    expect(calls('AND r.sponsor_id = ?')[0][1]).toEqual([DRIVER_ID, SPONSOR_ID, DRIVER_ID, SPONSOR_ID]);
    expect(db.commit).toHaveBeenCalledTimes(1);
  });

  it('refuses a driver who is not approved with this sponsor', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(onBehalfQueries({ approved: false }));
    const res = await agent.post('/api/sponsor/orders').send(body).expect(404);
    expect(res.body.message).toMatch(/not one of your approved drivers/);
    expect(calls('INSERT INTO orders')).toHaveLength(0);
  });

  it("names the driver when they can't afford the item", async () => {
    providerReturns(hardDrive);
    const agent = await signIn(app, users.sponsor);
    mockQueries(onBehalfQueries({ balance: 6000 }));
    const res = await agent.post('/api/sponsor/orders').send(body).expect(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_POINTS', message: 'Dana Driver needs 400 more points for this item.', pointBalance: 6000 });
    expect(db.rollback).toHaveBeenCalled();
    expect(calls('INSERT INTO orders')).toHaveLength(0);
  });

  it('names the driver when they have no shipping address', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(onBehalfQueries({ address: { shipping_address: null } }));
    const res = await agent.post('/api/sponsor/orders').send(body).expect(400);
    expect(res.body).toMatchObject({ code: 'ADDRESS_REQUIRED' });
    expect(res.body.message).toMatch(/^Dana Driver hasn't saved a shipping address/);
  });

  it('validates the request body', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);
    await agent.post('/api/sponsor/orders').send({ productId: 9, expectedPointCost: COST }).expect(400);
    await agent.post('/api/sponsor/orders').send({ driverId: DRIVER_ID, expectedPointCost: COST }).expect(400);
    await agent.post('/api/sponsor/orders').send({ driverId: DRIVER_ID, productId: 9, expectedPointCost: -1 }).expect(400);
  });

  it('is for sponsors only', async () => {
    await request(app).post('/api/sponsor/orders').send(body).expect(401);
    for (const user of [users.driver, users.admin]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.post('/api/sponsor/orders').send(body).expect(403);
    }
  });
});

describe('GET /api/sponsor/order-drivers', () => {
  it("lists approved drivers with their balance with this sponsor and whether they have an address", async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      ['AS has_address', [
        { user_id: 1, first_name: 'Dana', last_name: 'Driver', email: 'driver@test.com', has_address: 1 },
        { user_id: 4, first_name: '', last_name: '', email: 'other@test.com', has_address: 0 },
      ]],
      ['AND r.sponsor_id = ?', ([driverId]) => [{ points: driverId === 1 ? '7000' : '0' }]],
      roleLookup,
    ]);
    const res = await agent.get('/api/sponsor/order-drivers').expect(200);
    expect(calls('AS has_address')[0][1]).toEqual([SPONSOR_ID]);
    expect(res.body.drivers).toEqual([
      { id: 1, name: 'Dana Driver', email: 'driver@test.com', hasShippingAddress: true, pointBalance: 7000 },
      { id: 4, name: 'other@test.com', email: 'other@test.com', hasShippingAddress: false, pointBalance: 0 },
    ]);
  });

  it('is for sponsors only', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);
    await agent.get('/api/sponsor/order-drivers').expect(403);
  });
});
