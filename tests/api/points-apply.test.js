import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

// users.sponsor belongs to sponsor 10. users.driver is approved there;
// users.otherDriver is only approved with sponsor 11.
const rules = [
  { rule_id: 1, sponsor_id: 10, pt_value: 50, description: 'Safe driving week' },
  { rule_id: 2, sponsor_id: 10, pt_value: -30, description: 'Speeding alert' },
  { rule_id: 3, sponsor_id: 11, pt_value: 75, description: 'Other sponsor bonus' },
];
const approvals = [
  { driver_user_id: users.driver.user_id, sponsor_id: 10 },
  { driver_user_id: users.otherDriver.user_id, sponsor_id: 11 },
];
const TODAY = '2026-10-08';

// A small in-memory point_audit_log, so a write can be read back through the
// driver's chart endpoints.
let pointLog;

const queries = () => [
  roleLookup,
  ['INSERT INTO point_audit_log', ([actorId, ruleId, driverId, comment]) => {
    pointLog.push({ log_id: pointLog.length + 1, actorId, ruleId, driverId, comment, date: TODAY });
    return { insertId: pointLog.length };
  }],
  ['FROM sponsor_rules WHERE rule_id = ?', ([ruleId]) => rules.filter((rule) => rule.rule_id === ruleId)],
  ["AND status = 'approved'", ([driverId, sponsorId]) => approvals
    .filter((row) => row.driver_user_id === driverId && row.sponsor_id === sponsorId)
    .map(() => ({ application_id: 1 }))],
  ['GROUP BY date', ([driverId]) => {
    const byDate = {};
    for (const entry of pointLog.filter((row) => row.driverId === driverId)) {
      const rule = rules.find((r) => r.rule_id === entry.ruleId);
      byDate[entry.date] = (byDate[entry.date] || 0) + rule.pt_value;
    }
    return Object.entries(byDate).map(([date, change]) => ({ date, change_amount: String(change) }));
  }],
];

beforeEach(() => {
  db.execute.mockReset();
  pointLog = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/points/apply', () => {
  it('requires a session', async () => {
    await request(app).post('/api/points/apply').send({ driverUserId: 1, ruleId: 1 }).expect(401);
  });

  it.each([['driver', users.driver], ['admin', users.admin]])('blocks %s accounts', async (_, user) => {
    const agent = await signIn(app, user);
    mockQueries(queries());

    await agent.post('/api/points/apply').send({ driverUserId: 1, ruleId: 1 }).expect(403);
    expect(pointLog).toHaveLength(0);
  });

  it.each([
    ['a missing driver', { ruleId: 1 }, /valid driver/],
    ['a missing rule', { driverUserId: 1 }, /point rule/],
    ['a comment over 45 characters', { driverUserId: 1, ruleId: 1, comment: 'x'.repeat(46) }, /45 characters/],
  ])('rejects %s', async (_, body, message) => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(queries());

    const res = await agent.post('/api/points/apply').send(body).expect(400);

    expect(res.body.message).toMatch(message);
    expect(pointLog).toHaveLength(0);
  });

  it('applies a rule and logs it with the amount and reason from the rule', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(queries());

    const res = await agent.post('/api/points/apply')
      .send({ driverUserId: users.driver.user_id, ruleId: 2, comment: ' Radar on I-85 ', changeAmount: 9999 })
      .expect(201);

    expect(res.body).toEqual({
      log_id: 1, driver_user_id: users.driver.user_id, rule_id: 2, reason: 'Speeding alert', change_amount: -30,
    });
    expect(pointLog).toEqual([{
      log_id: 1, actorId: users.sponsor.user_id, ruleId: 2, driverId: users.driver.user_id, comment: 'Radar on I-85', date: TODAY,
    }]);
  });

  it('returns 404 for an unknown rule', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(queries());

    await agent.post('/api/points/apply').send({ driverUserId: users.driver.user_id, ruleId: 99 }).expect(404);
  });

  it("cannot apply another sponsor's rule", async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(queries());

    await agent.post('/api/points/apply').send({ driverUserId: users.driver.user_id, ruleId: 3 }).expect(403);
    expect(pointLog).toHaveLength(0);
  });

  it("cannot adjust a driver outside the sponsor's program", async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries(queries());

    const res = await agent.post('/api/points/apply')
      .send({ driverUserId: users.otherDriver.user_id, ruleId: 1 })
      .expect(403);

    expect(res.body.message).toMatch(/not in your sponsor program/);
    expect(pointLog).toHaveLength(0);
  });

  it("shows up in the driver's point trend", async () => {
    const sponsor = await signIn(app, users.sponsor);
    mockQueries(queries());
    await sponsor.post('/api/points/apply').send({ driverUserId: users.driver.user_id, ruleId: 1 }).expect(201);
    await sponsor.post('/api/points/apply').send({ driverUserId: users.driver.user_id, ruleId: 1 }).expect(201);
    await sponsor.post('/api/points/apply').send({ driverUserId: users.driver.user_id, ruleId: 2 }).expect(201);

    const driver = await signIn(app, users.driver);
    mockQueries(queries());
    const res = await driver.get('/api/points/trend').expect(200);

    expect(res.body).toEqual([{ date: TODAY, cumulative_total: 70 }]);
  });
});
