import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('driver applications', () => {
  it('requires a session', async () => {
    await request(app).post('/api/applications').send({ sponsorId: 10 }).expect(401);
  });

  it('only drivers can apply', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    await agent.post('/api/applications').send({ sponsorId: 10 }).expect(403);
  });

  it('submits a pending application', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM sponsors WHERE sponsor_id = ?', [{ sponsor_id: 10 }]],
      ["status IN ('pending', 'approved')", []],
      ['INSERT INTO driver_applications', { insertId: 99 }],
    ]);

    const res = await agent.post('/api/applications').send({ sponsorId: 10 }).expect(201);

    expect(res.body).toEqual({ application_id: 99, sponsor_id: 10, status: 'pending' });
    const insert = db.execute.mock.calls.find(([sql]) => sql.includes('INSERT'));
    expect(insert[1]).toEqual([users.driver.user_id, 10]);
  });

  it('blocks a second application to the same sponsor', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM sponsors WHERE sponsor_id = ?', [{ sponsor_id: 10 }]],
      ["status IN ('pending', 'approved')", [{ application_id: 5 }]],
    ]);

    await agent.post('/api/applications').send({ sponsorId: 10 }).expect(409);
  });

  it('rejects an invalid status filter', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent.get('/api/applications?status=bogus').expect(400);
  });
});

describe('sponsor decisions', () => {
  it('rejects decisions other than approved or rejected', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    await agent.patch('/api/applications/5/decide').send({ decision: 'maybe' }).expect(400);
  });

  it("cannot decide another sponsor's application", async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE application_id = ?', [{ sponsor_id: 11, status: 'pending' }]],
    ]);

    await agent.patch('/api/applications/5/decide').send({ decision: 'approved' }).expect(403);
  });

  it('cannot decide an application that is no longer pending', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE application_id = ?', [{ sponsor_id: 10, status: 'withdrawn' }]],
    ]);

    await agent.patch('/api/applications/5/decide').send({ decision: 'approved' }).expect(409);
  });

  it('approves a pending application', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE application_id = ?', [{ sponsor_id: 10, status: 'pending' }]],
      ['UPDATE driver_applications', { affectedRows: 1 }],
    ]);

    const res = await agent.patch('/api/applications/5/decide').send({ decision: 'approved' }).expect(200);

    expect(res.body).toEqual({ application_id: 5, status: 'approved' });
  });
});
