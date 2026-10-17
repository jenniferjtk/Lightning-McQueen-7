import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, signIn, users } from './helpers.js';

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
