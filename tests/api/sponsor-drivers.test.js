import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sponsor driver list', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/sponsor/drivers').expect(401);
  });

  it('only exposes approved drivers in the signed-in sponsor organization with point balances', async () => {
    const agent = await signIn(app, users.sponsor);
    const driver = {
      id: users.driver.user_id,
      firstName: users.driver.first_name,
      lastName: users.driver.last_name,
      email: users.driver.email,
      createdAt: '2026-10-01',
      points: '125',
      applicationId: 44,
      status: 'approved',
      submittedAt: '2026-10-01T12:00:00.000Z',
      decidedAt: '2026-10-02T12:00:00.000Z',
      sponsorName: 'Acme Trucking',
    };
    mockQueries([
      ['SELECT role, sponsor_id FROM users', [users.sponsor]],
      ['FROM driver_applications a', [driver]],
    ]);

    const response = await agent.get('/api/sponsor/drivers').expect(200);

    expect(response.body).toEqual({ sponsorLinked: true, drivers: [{ ...driver, points: 125 }] });
    const listQuery = db.execute.mock.calls.find(([sql]) => sql.includes('FROM driver_applications a'));
    expect(listQuery[1]).toEqual([users.sponsor.sponsor_id]);
    expect(listQuery[0]).toContain("a.status = 'approved'");
    expect(listQuery[0]).toContain('point_audit_log');
    expect(listQuery[0]).toContain('a.application_id AS applicationId');
    expect(listQuery[0]).toContain('a.submitted_at AS submittedAt');
  });

  it('rejects non-sponsor accounts', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([['SELECT role, sponsor_id FROM users', [users.driver]]]);

    await agent.get('/api/sponsor/drivers').expect(403);
  });

  it('returns an empty list when the sponsor account is not linked to an organization', async () => {
    const agent = await signIn(app, { ...users.sponsor, sponsor_id: null });
    mockQueries([['SELECT role, sponsor_id FROM users', [{ ...users.sponsor, sponsor_id: null }]]]);

    await agent.get('/api/sponsor/drivers').expect(200, { sponsorLinked: false, drivers: [] });
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

describe('sponsor driver point history', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/sponsor/drivers/1/points/trend').expect(401);
  });

  it('only allows sponsors to view approved drivers in their organization', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE driver_user_id = ?', []],
    ]);

    await agent.get('/api/sponsor/drivers/4/points/trend')
      .expect(403, { message: 'This driver is not in your sponsor program.' });
    expect(db.execute.mock.calls[1][1]).toEqual([users.otherDriver.user_id, users.sponsor.sponsor_id]);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it('returns the approved driver’s cumulative points by date', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE driver_user_id = ?', [{ application_id: 44 }]],
      ['GROUP BY date', [
        { date: '2026-09-01', change_amount: '50' },
        { date: '2026-09-03', change_amount: '-30' },
      ]],
    ]);

    const response = await agent.get('/api/sponsor/drivers/1/points/trend').expect(200);

    expect(response.body).toEqual([
      { date: '2026-09-01', cumulative_total: 50 },
      { date: '2026-09-03', cumulative_total: 20 },
    ]);
    expect(db.execute.mock.calls[2][1]).toEqual([users.driver.user_id]);
  });

  it('rejects invalid driver ids', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([roleLookup]);

    await agent.get('/api/sponsor/drivers/not-a-driver/points/trend')
      .expect(400, { message: 'Invalid driver account.' });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects non-sponsor accounts', async () => {
    const agent = await signIn(app, users.driver);
    db.execute.mockClear();
    mockQueries([roleLookup]);

    await agent.get('/api/sponsor/drivers/1/points/trend').expect(403);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
