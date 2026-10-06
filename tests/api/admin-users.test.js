import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');
const fields = { firstName: ' New ', lastName: ' User ', email: 'NEW@example.com', password: 'test-password' };
beforeEach(() => { db.execute.mockReset(); });

it('requires an authenticated admin to create accounts', async () => {
  await request(app).post('/api/admin/users').send({ ...fields, role: 'admin' }).expect(401);
  for (const user of [users.driver, users.sponsor]) {
    const agent = await signIn(app, user);
    mockQueries([roleLookup]);
    await agent.post('/api/admin/users').send({ ...fields, role: 'admin' }).expect(403);
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  }
});

it.each(['driver', 'sponsor', 'admin'])('creates a %s with a hashed password', async (role) => {
  const agent = await signIn(app, users.admin);
  let inserted;
  mockQueries([
    ['SELECT role FROM users', [{ role: 'admin' }]],
    ['INSERT INTO users', (params) => { inserted = params; return { insertId: 20 }; }],
    ['SELECT user_id, email, role', [{ user_id: 20, email: 'new@example.com', role, first_name: 'New', last_name: 'User', created_at: '2026-10-05' }]],
  ]);
  const res = await agent.post('/api/admin/users').send({ ...fields, role }).expect(201);
  expect(inserted).toEqual(['new@example.com', expect.any(String), role, 'New', 'User']);
  expect(await bcrypt.compare(fields.password, inserted[1])).toBe(true);
  expect(res.body.user).toMatchObject({ id: 20, role, firstName: 'New', lastName: 'User' });
  expect(res.body.user).not.toHaveProperty('password_hash');
});

it.each([{ role: 'owner' }, { role: null }, { password: 'short' }, { firstName: {} }, { email: 'bad' }, { password: 'x'.repeat(73) }])('rejects invalid input %j', async (override) => {
  const agent = await signIn(app, users.admin);
  mockQueries([roleLookup]);
  await agent.post('/api/admin/users').send({ ...fields, role: 'driver', ...override }).expect(400);
  expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
});

it('reports duplicate email addresses', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([roleLookup, ['INSERT INTO users', () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); }]]);
  await agent.post('/api/admin/users').send({ ...fields, role: 'admin' }).expect(409);
});
