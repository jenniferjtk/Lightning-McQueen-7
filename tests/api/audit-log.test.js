import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

const entries = [{
  category: 'driver_application',
  date: '2026-10-12 10:30:00',
  sponsorName: 'Sam Sponsor',
  driverName: 'Dana Driver',
  driverId: '1',
  status: 'rejected',
  points: null,
  reason: 'Incomplete application',
  username: null,
  changeType: null,
  success: null,
}];

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sponsor audit log report', () => {
  it('requires an authenticated sponsor or admin', async () => {
    await request(app)
      .get('/api/reports/audit-log?startDate=2026-10-01&endDate=2026-10-31')
      .expect(401);
  });

  it('blocks drivers', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent
      .get('/api/reports/audit-log?startDate=2026-10-01&endDate=2026-10-31')
      .expect(403);
  });

  it('validates date ranges and categories', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    await agent.get('/api/reports/audit-log?startDate=2026-03-01&endDate=2026-03-01').expect(400);
    await agent.get('/api/reports/audit-log?startDate=2026-02-30&endDate=2026-03-01').expect(400);
    await agent.get('/api/reports/audit-log?startDate=2026-03-01&endDate=2026-03-01&category=other').expect(400);
  });

  it('returns selected categories and restricts every event type to this sponsor', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM driver_applications a', entries],
    ]);

    const response = await agent
      .get('/api/reports/audit-log?startDate=2026-10-01&endDate=2026-10-31&category=driver_application')
      .expect(200);

    expect(response.body.entries).toEqual([{ ...entries[0], driverId: 1 }]);
    const [query, params] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM driver_applications a'));
    expect(query).toContain("SELECT 'driver_application' AS category, a.decided_at AS occurred_at, a.sponsor_id");
    expect(query).toContain('NULL AS points, NULL AS reason');
    expect(query).not.toContain('decision_reason');
    expect(query).toContain('FROM driver_applications a');
    expect(query).not.toContain("WHERE e.category IN ('driver_application'");
    expect(query).toContain("events.category = 'driver_application' AND events.sponsor_id = ?");
    expect(query).toContain("events.category = 'point_change' AND events.sponsor_id = ?");
    expect(query).toContain("CONCAT(actor.first_name, ' ', actor.last_name) AS sponsorUserName");
    expect(query).toContain('JOIN users actor ON actor.user_id = l.actor_id');
    expect(query).toContain('events.sponsorUserName');
    expect(query).toContain("a.status = 'approved'");
    expect(params).toEqual([
      '2026-10-01',
      '2026-10-31',
      'driver_application',
      users.sponsor.sponsor_id,
      users.sponsor.sponsor_id,
      users.sponsor.sponsor_id,
      users.sponsor.sponsor_id,
    ]);
  });

  it('requires an individual category instead of allowing a combined report', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    await agent.get('/api/reports/audit-log?startDate=2026-10-01&endDate=2026-10-31&category=all')
      .expect(400, { message: 'Choose a valid audit log category.' });
  });

  it('returns the acting sponsor user in the point-change sponsor field', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM driver_applications a', [{
        category: 'point_change',
        date: '2026-10-12 10:30:00',
        sponsorName: 'Acme Trucking',
        sponsorUserName: 'Sam Sponsor',
        driverName: 'Dana Driver',
        driverId: '1',
        points: 12,
        reason: 'Safe driving',
      }]],
    ]);

    const response = await agent
      .get('/api/reports/audit-log?startDate=2026-10-01&endDate=2026-10-31&category=point_change')
      .expect(200);

    expect(response.body.entries[0].sponsorUserName).toBe('Sam Sponsor');
    expect(response.body.entries[0].sponsorName).toBe('Acme Trucking');
    const [query] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM driver_applications a'));
    expect(query).toContain("CONCAT(actor.first_name, ' ', actor.last_name) AS sponsorUserName");
    expect(query).toContain('JOIN users actor ON actor.user_id = l.actor_id');
  });
});
