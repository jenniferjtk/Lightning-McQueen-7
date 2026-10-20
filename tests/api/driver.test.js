import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

const driverQueries = ({ balance, recent }) => [
  ['SELECT user_id, first_name, last_name, created_at FROM users', [{ ...users.driver, created_at: '2026-09-29' }]],
  ["a.status = 'approved'", [{ name: 'Acme Trucking' }]],
  ['COALESCE(SUM(r.pt_value), 0)', [{ points: balance }]],
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
      balance: '21',
      recent: [
        { log_id: 9, description: 'Speeding alert', pt_value: -30, date: 'Oct 8, 2026' },
        { log_id: 8, description: 'Safe driving week', pt_value: 50, date: 'Oct 7, 2026' },
        { log_id: 7, description: "'Full stop at stop signs'", pt_value: 1, date: 'Oct 7, 2026' },
      ],
    }));

    const res = await agent.get('/api/driver').expect(200);

    expect(res.body).toMatchObject({
      name: 'Dana Driver',
      sponsorName: 'Acme Trucking',
      points: 21,
      balanceNotifications: [
        { id: 9, label: 'Speeding alert', date: 'Oct 8, 2026', amount: -30 },
        { id: 8, label: 'Safe driving week', date: 'Oct 7, 2026', amount: 50 },
        { id: 7, label: "'Full stop at stop signs'", date: 'Oct 7, 2026', amount: 1 },
      ],
    });
    const balanceCall = db.execute.mock.calls.find(([sql]) => sql.includes('COALESCE'));
    expect(balanceCall[1]).toEqual([users.driver.user_id]);
  });

  it('returns a zero balance and no updates for a driver with no point history', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries(driverQueries({ balance: 0, recent: [] }));

    const res = await agent.get('/api/driver').expect(200);

    expect(res.body.points).toBe(0);
    expect(res.body.balanceNotifications).toEqual([]);
  });
});
