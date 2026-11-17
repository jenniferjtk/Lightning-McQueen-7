import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const orderRow = {
  order_id: 7, sponsor_id: 10, sponsor_name: 'Acme Freight', product_id: 9, product_title: 'Hard Drive',
  unit_price: '64.00', point_cost: 6400, status: 'pending', created_at: '2026-11-15T12:00:00.000Z',
  driver_user_id: 1, driver_first_name: 'Dana', driver_last_name: 'Driver', driver_email: 'driver@test.com',
};

describe('GET /api/sponsor/orders', () => {
  it('is limited to signed-in sponsors', async () => {
    await request(app).get('/api/sponsor/orders').expect(401);
    for (const user of [users.driver, users.admin]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.get('/api/sponsor/orders').expect(403);
    }
  });

  it("lists only the sponsor's own orders with the driver and points", async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, ['FROM orders o', [orderRow, { ...orderRow, order_id: 6, status: 'canceled', driver_first_name: '', driver_last_name: '' }]]]);
    const res = await agent.get('/api/sponsor/orders').expect(200);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE o.sponsor_id = ?'), [10]);
    expect(res.body.orders[0]).toEqual({
      orderId: 7, sponsorId: 10, sponsorName: 'Acme Freight', productId: 9, productTitle: 'Hard Drive',
      unitPrice: 64, pointCost: 6400, status: 'pending', createdAt: '2026-11-15T12:00:00.000Z',
      estimatedDelivery: '2026-11-20',
      driver: { id: 1, name: 'Dana Driver', email: 'driver@test.com' },
    });
    expect(res.body.orders[1].driver.name).toBe('driver@test.com');
  });

  it('reports a database failure', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, ['FROM orders o', () => { throw new Error('db down'); }]]);
    await agent.get('/api/sponsor/orders').expect(500);
  });
});
