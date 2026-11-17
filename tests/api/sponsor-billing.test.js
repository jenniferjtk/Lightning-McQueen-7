import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const URL = '/api/admin/reports/sponsor-billing?startDate=2026-11-01&endDate=2026-11-30';
const row = (order_id, sponsor_id, sponsor_name, unit_price, point_cost, extra = {}) => ({
  order_id, sponsor_id, sponsor_name, unit_price, point_cost, status: 'pending', created_at: '2026-11-10T15:00:00.000Z',
  product_title: `Item ${order_id}`, driver_first_name: 'Dana', driver_last_name: 'Driver', driver_email: 'dana@test.com', ...extra,
});

describe('GET /api/admin/reports/sponsor-billing', () => {
  it('is limited to admins', async () => {
    await request(app).get(URL).expect(401);
    for (const user of [users.driver, users.sponsor]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.get(URL).expect(403);
    }
  });

  it.each([
    ['?startDate=2026-11-01', 'missing end'],
    ['?startDate=2026-02-30&endDate=2026-03-01', 'impossible date'],
    ['?startDate=2026-11-30&endDate=2026-11-01', 'end before start'],
  ])('rejects %s (%s)', async (query) => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup]);
    await agent.get(`/api/admin/reports/sponsor-billing${query}`).expect(400);
  });

  it('totals non-canceled purchases per sponsor in cents', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, ['FROM orders o', [
      row(3, 10, 'Acme Freight', '0.10', 10),
      row(2, 10, 'Acme Freight', '0.20', 20, { status: 'delivered', driver_first_name: '', driver_last_name: '' }),
      row(1, 11, 'Blue Line', '64.00', 6400),
    ]]]);
    const res = await agent.get(URL).expect(200);

    const [sql, params] = db.execute.mock.calls.find(([text]) => text.includes('FROM orders o'));
    expect(sql).toContain("o.status <> 'canceled'");
    expect(params).toEqual(['2026-11-01', '2026-11-30']);
    expect(res.body.sponsors).toEqual([
      // 0.10 + 0.20 is 0.30 exactly, not 0.30000000000000004.
      { sponsorId: 10, sponsorName: 'Acme Freight', orderCount: 2, pointsRedeemed: 30, amountDue: 0.3 },
      { sponsorId: 11, sponsorName: 'Blue Line', orderCount: 1, pointsRedeemed: 6400, amountDue: 64 },
    ]);
    expect(res.body.totals).toEqual({ orderCount: 3, pointsRedeemed: 6430, amountDue: 64.3 });
    expect(res.body.purchases[1]).toEqual({
      orderId: 2, createdAt: '2026-11-10T15:00:00.000Z', status: 'delivered', sponsorId: 10, sponsorName: 'Acme Freight',
      driverName: 'dana@test.com', productTitle: 'Item 2', unitPrice: 0.2, pointCost: 20,
    });
  });

  it('returns empty totals when nothing was bought', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, ['FROM orders o', []]]);
    const res = await agent.get(URL).expect(200);
    expect(res.body).toEqual({ sponsors: [], purchases: [], totals: { orderCount: 0, pointsRedeemed: 0, amountDue: 0 } });
  });

  it('reports a database failure', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, ['FROM orders o', () => { throw new Error('db down'); }]]);
    await agent.get(URL).expect(500);
  });
});
