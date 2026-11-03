import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  db.getConnection.mockClear();
  db.beginTransaction.mockReset();
  db.commit.mockReset();
  db.rollback.mockReset();
  db.release.mockReset();
});

it('restricts driver affiliation changes to admins', async () => {
  await request(app).put('/api/admin/drivers/1/affiliation').send({ sponsorId: 10 }).expect(401);
  const agent = await signIn(app, users.driver);
  mockQueries([roleLookup]);
  await agent.put('/api/admin/drivers/1/affiliation').send({ sponsorId: 10 }).expect(403);
});

it('returns the latest approved sponsor id for each driver', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([
    roleLookup,
    ['FROM users u', [{
      user_id: 1,
      email: 'driver@test.com',
      first_name: 'Dana',
      last_name: 'Driver',
      created_at: '2026-10-01',
      sponsor_id: 11,
      affiliation: 'Roadrunner Logistics',
    }]],
  ]);

  const response = await agent.get('/api/admin/drivers').expect(200);

  expect(response.body.drivers[0]).toMatchObject({
    id: 1,
    sponsorId: 11,
    affiliation: 'Roadrunner Logistics',
  });
});

it('replaces other approved affiliations with an existing selected sponsor', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([
    roleLookup,
    ['SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [{ sponsor_id: 11 }]],
    ['SELECT application_id FROM driver_applications', [{ application_id: 42 }]],
    ['UPDATE driver_applications', { affectedRows: 1 }],
  ]);

  const response = await agent.put('/api/admin/drivers/1/affiliation').send({ sponsorId: 11 }).expect(200);

  expect(response.body).toEqual({ message: 'Driver sponsor affiliation saved.', sponsorId: 11 });
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('AND application_id <> ?'), [1, 42]);
  expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO driver_applications'))).toBe(false);
  expect(db.commit).toHaveBeenCalledOnce();
});

it('creates an approved affiliation when the selected sponsor is new', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([
    roleLookup,
    ['SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [{ sponsor_id: 11 }]],
    ['SELECT application_id FROM driver_applications', []],
    ['UPDATE driver_applications', { affectedRows: 1 }],
    ['INSERT INTO driver_applications', { insertId: 51 }],
  ]);

  await agent.put('/api/admin/drivers/1/affiliation').send({ sponsorId: 11 }).expect(200);

  expect(db.execute).toHaveBeenCalledWith(
    expect.stringContaining("VALUES (?, ?, 'approved', NOW())"),
    [1, 11],
  );
  expect(db.commit).toHaveBeenCalledOnce();
});

it('clears all approved affiliations when no sponsor is selected', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([roleLookup, ['UPDATE driver_applications', { affectedRows: 1 }]]);

  const response = await agent.put('/api/admin/drivers/1/affiliation').send({ sponsorId: null }).expect(200);

  expect(response.body).toEqual({ message: 'Driver sponsor affiliation saved.', sponsorId: null });
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("SET status = 'rejected'"), [1]);
  expect(db.commit).toHaveBeenCalledOnce();
});
