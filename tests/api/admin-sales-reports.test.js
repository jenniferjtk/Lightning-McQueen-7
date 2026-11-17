import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin sales reports', () => {
  it('requires an authenticated administrator', async () => {
    await request(app)
      .get('/api/admin/reports/sales?startDate=2026-10-01&endDate=2026-10-31')
      .expect(401);
  });

  it('blocks sponsors', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    await agent
      .get('/api/admin/reports/sales?startDate=2026-10-01&endDate=2026-10-31')
      .expect(403);
  });

  it('validates report dates, report type, and view', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup]);

    await agent.get('/api/admin/reports/sales?startDate=2026-02-30&endDate=2026-03-01').expect(400);
    await agent.get('/api/admin/reports/sales?startDate=2026-11-01&endDate=2026-10-01').expect(400);
    await agent.get('/api/admin/reports/sales?startDate=2026-10-01&endDate=2026-10-31&reportType=unknown').expect(400);
    await agent.get('/api/admin/reports/sales?startDate=2026-10-01&endDate=2026-10-31&view=unknown').expect(400);
  });

  it('returns sponsor sales summaries and excludes canceled orders', async () => {
    const agent = await signIn(app, users.admin);
    const summaryRows = [{
      sponsorId: '10',
      sponsorName: 'Sam Sponsor',
      orderCount: '2',
      salesTotal: '125.50',
      pointsRedeemed: '300',
    }];
    mockQueries([
      roleLookup,
      ['FROM orders o', summaryRows],
    ]);

    const response = await agent
      .get('/api/admin/reports/sales?startDate=2026-10-01&endDate=2026-10-31&reportType=sponsor&view=summary')
      .expect(200);

    expect(response.body.entries).toEqual([{
      sponsorId: 10,
      sponsorName: 'Sam Sponsor',
      orderCount: 2,
      salesTotal: 125.5,
      pointsRedeemed: 300,
    }]);
    const [query, params] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM orders o'));
    expect(query).toContain("o.status <> 'canceled'");
    expect(query).toContain('GROUP BY s.sponsor_id, s.name');
    expect(params).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('applies sponsor and driver filters to detailed driver sales', async () => {
    const agent = await signIn(app, users.admin);
    const detailedRows = [{
      orderId: '5',
      saleDate: '2026-10-12',
      driverId: '1',
      driverName: 'Dana Driver',
      sponsorId: '10',
      sponsorName: 'Sam Sponsor',
      productTitle: 'Helmet',
      amount: '50.00',
      pointCost: '100',
      status: 'delivered',
    }];
    mockQueries([
      roleLookup,
      ['FROM orders o', detailedRows],
    ]);

    const response = await agent
      .get('/api/admin/reports/sales?startDate=2026-10-01&endDate=2026-10-31&reportType=driver&view=detailed&sponsorId=10&driverId=1')
      .expect(200);

    expect(response.body.entries[0]).toMatchObject({
      orderId: 5,
      driverId: 1,
      sponsorId: 10,
      amount: 50,
      pointCost: 100,
    });
    const [query, params] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM orders o'));
    expect(query).toContain('o.sponsor_id = ?');
    expect(query).toContain('o.driver_user_id = ?');
    expect(params).toEqual(['2026-10-01', '2026-10-31', 10, 1]);
  });

  it('returns sponsor choices and sponsor-scoped approved drivers', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([
      roleLookup,
      ['FROM sponsors', [{ id: 10, name: 'Sam Sponsor' }]],
      ['FROM driver_applications a', [{ id: 1, name: 'Dana Driver' }]],
    ]);

    const response = await agent
      .get('/api/admin/reports/sales/options?sponsorId=10')
      .expect(200);

    expect(response.body).toEqual({
      sponsors: [{ id: 10, name: 'Sam Sponsor' }],
      drivers: [{ id: 1, name: 'Dana Driver' }],
    });
    expect(db.execute.mock.calls.find(([sql]) => sql.includes('FROM driver_applications a'))[1]).toEqual([10]);
  });
});
