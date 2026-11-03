import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

const reportEntry = [{
  driverId: '1',
  driverName: 'Dana Driver',
  totalPoints: '125',
  pointChange: '25',
  changeDate: '2026-10-12',
  sponsorName: 'Sam Sponsor',
  reason: 'Safe driving',
}];

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sponsor point reports', () => {
  it('requires an authenticated sponsor or admin', async () => {
    await request(app)
      .get('/api/reports/sponsor-points?startDate=2026-10-01&endDate=2026-10-31')
      .expect(401);
  });

  it('blocks drivers', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent
      .get('/api/reports/sponsor-points?startDate=2026-10-01&endDate=2026-10-31')
      .expect(403);
  });

  it('validates required dates and date order', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup]);

    await agent.get('/api/reports/sponsor-points?startDate=2026-02-30&endDate=2026-03-01').expect(400);
    await agent.get('/api/reports/sponsor-points?startDate=2026-11-01&endDate=2026-10-01').expect(400);
  });

  it('returns report rows to admins with the selected date and driver filters', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([
      roleLookup,
      ['FROM point_audit_log l', reportEntry],
    ]);

    const response = await agent
      .get('/api/reports/sponsor-points?startDate=2026-10-01&endDate=2026-10-31&driverId=1')
      .expect(200);

    expect(response.body.entries).toEqual([{
      ...reportEntry[0],
      driverId: 1,
      totalPoints: 125,
      pointChange: 25,
    }]);
    const [query, params] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM point_audit_log l'));
    expect(query).toContain('u.user_id = ?');
    expect(query).toContain("NULLIF(l.comment, '')");
    expect(query).not.toContain('a.sponsor_id = ?');
    expect(params).toEqual(['2026-10-01', '2026-10-31', 1]);
  });

  it('restricts sponsor results to their approved drivers', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM point_audit_log l', reportEntry],
    ]);

    await agent
      .get('/api/reports/sponsor-points?startDate=2026-10-01&endDate=2026-10-31')
      .expect(200);

    const [query, params] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM point_audit_log l'));
    expect(query).toContain("a.status = 'approved'");
    expect(params).toEqual(['2026-10-01', '2026-10-31', users.sponsor.sponsor_id]);
  });
});
