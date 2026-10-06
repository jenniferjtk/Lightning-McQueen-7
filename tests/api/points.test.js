import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

// What the database would return for each driver, already grouped by the SQL.
const reasonTotals = {
  [users.driver.user_id]: {
    gains: [{ reason: 'On-time delivery', total: '75' }, { reason: 'Safe driving week', total: '250' }],
    losses: [{ reason: 'Late delivery', total: '-40' }, { reason: 'Speeding alert', total: '-60' }],
  },
  [users.otherDriver.user_id]: {
    gains: [{ reason: 'Other driver bonus', total: '999' }],
    losses: [{ reason: 'Other driver penalty', total: '-999' }],
  },
};
const dailyChanges = {
  [users.driver.user_id]: [
    { date: '2026-09-01', change_amount: '50' },
    { date: '2026-09-03', change_amount: '-30' },
    { date: '2026-09-08', change_amount: '75' },
  ],
  [users.otherDriver.user_id]: [{ date: '2026-09-02', change_amount: '999' }],
};

const pointQueries = [
  roleLookup,
  ['r.pt_value > 0', ([driverId]) => reasonTotals[driverId]?.gains ?? []],
  ['r.pt_value < 0', ([driverId]) => reasonTotals[driverId]?.losses ?? []],
  ['GROUP BY date', ([driverId]) => dailyChanges[driverId] ?? []],
];

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('point history endpoints', () => {
  it.each(['gains', 'losses', 'trend'])('/api/points/%s requires a session', async (kind) => {
    await request(app).get(`/api/points/${kind}`).expect(401);
  });

  it.each(['gains', 'losses', 'trend'])('/api/points/%s is driver-only', async (kind) => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(pointQueries);

    await agent.get(`/api/points/${kind}`).expect(403);
  });

  it('returns gains by reason, largest first', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries(pointQueries);

    const res = await agent.get('/api/points/gains').expect(200);

    expect(res.body).toEqual([
      { reason: 'Safe driving week', total: 250 },
      { reason: 'On-time delivery', total: 75 },
    ]);
  });

  it('returns losses as positive totals, largest first', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries(pointQueries);

    const res = await agent.get('/api/points/losses').expect(200);

    expect(res.body).toEqual([
      { reason: 'Speeding alert', total: 60 },
      { reason: 'Late delivery', total: 40 },
    ]);
  });

  it('returns a running point total by date', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries(pointQueries);

    const res = await agent.get('/api/points/trend').expect(200);

    expect(res.body).toEqual([
      { date: '2026-09-01', cumulative_total: 50 },
      { date: '2026-09-03', cumulative_total: 20 },
      { date: '2026-09-08', cumulative_total: 95 },
    ]);
  });

  it.each(['gains', 'losses', 'trend'])('/api/points/%s returns [] for a driver with no history', async (kind) => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM point_audit_log', []],
    ]);

    const res = await agent.get(`/api/points/${kind}`).expect(200);

    expect(res.body).toEqual([]);
  });

  it("ignores a driverUserId in the query and never returns another driver's points", async () => {
    const agent = await signIn(app, users.driver);
    mockQueries(pointQueries);

    for (const kind of ['gains', 'losses', 'trend']) {
      const res = await agent.get(`/api/points/${kind}?driverUserId=${users.otherDriver.user_id}`).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/Other driver|999/);
    }
    const pointCalls = db.execute.mock.calls.filter(([sql]) => sql.includes('point_audit_log'));
    expect(pointCalls).toHaveLength(3);
    for (const [, params] of pointCalls) expect(params).toEqual([users.driver.user_id]);
  });

  it('returns 500 when the database fails', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent.get('/api/points/gains').expect(500);
  });
});
