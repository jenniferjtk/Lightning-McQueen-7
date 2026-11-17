import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

const driverQueries = ({ sponsors, recent }) => [
  ['SELECT user_id, first_name, last_name, created_at FROM users', [{ ...users.driver, created_at: '2026-09-29' }]],
  ["a.status = 'approved'", sponsors],
  ['LIMIT 5', recent],
  roleLookup,
];

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/driver', () => {
  it('requires a session', async () => {
    await request(app).get('/api/driver').expect(401);
  });

  it('returns the point balance and recent point updates from the point log', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries(driverQueries({
      sponsors: [
        { id: 10, name: 'Acme Trucking', points: '21', pointConversionRate: '0.0100' },
        { id: 11, name: 'Roadrunner Logistics', points: '5', pointConversionRate: '0.0200' },
      ],
      recent: [
        { log_id: 9, description: 'Speeding alert', pt_value: -30, sponsor_name: 'Acme Trucking', date: 'Oct 8, 2026' },
        { log_id: 8, description: 'Safe driving week', pt_value: 50, sponsor_name: 'Roadrunner Logistics', date: 'Oct 7, 2026' },
        { log_id: 7, description: "'Full stop at stop signs'", pt_value: 1, sponsor_name: 'Acme Trucking', date: 'Oct 7, 2026' },
      ],
    }));

    const res = await agent.get('/api/driver').expect(200);

    expect(res.body).toMatchObject({
      name: 'Dana Driver',
      sponsorName: 'Acme Trucking, Roadrunner Logistics',
      points: 26,
      sponsors: [
        { id: 10, name: 'Acme Trucking', points: 21, pointConversionRate: 0.01 },
        { id: 11, name: 'Roadrunner Logistics', points: 5, pointConversionRate: 0.02 },
      ],
      balanceNotifications: [
        { id: 9, label: 'Speeding alert', sponsorName: 'Acme Trucking', date: 'Oct 8, 2026', amount: -30 },
        { id: 8, label: 'Safe driving week', sponsorName: 'Roadrunner Logistics', date: 'Oct 7, 2026', amount: 50 },
        { id: 7, label: "'Full stop at stop signs'", sponsorName: 'Acme Trucking', date: 'Oct 7, 2026', amount: 1 },
      ],
    });
    const balanceCall = db.execute.mock.calls.find(([sql]) => sql.includes("a.status = 'approved'"));
    expect(balanceCall[1]).toEqual([users.driver.user_id, users.driver.user_id, users.driver.user_id]);
    expect(balanceCall[0]).toContain("o.status <> 'canceled'");
  });

  it('returns a zero balance and no updates for a driver with no point history', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries(driverQueries({ sponsors: [], recent: [] }));

    const res = await agent.get('/api/driver').expect(200);

    expect(res.body.points).toBe(0);
    expect(res.body.balanceNotifications).toEqual([]);
  });

  it('returns the point value for each approved sponsor', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM users u', [
        { sponsor_id: 10, sponsor_name: 'Acme Trucking', point_conversion_rate: '0.0100' },
        { sponsor_id: 11, sponsor_name: 'Roadrunner Logistics', point_conversion_rate: '0.0200' },
      ]],
    ]);

    const response = await agent.get('/api/driver/conversion').expect(200);
    expect(response.body.conversions).toEqual([
      { sponsorId: 10, sponsorName: 'Acme Trucking', pointConversionRate: 0.01 },
      { sponsorId: 11, sponsorName: 'Roadrunner Logistics', pointConversionRate: 0.02 },
    ]);
  });
});
