import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');
const fields = { firstName: ' New ', lastName: ' User ', email: 'NEW@example.com', password: 'test-password' };
beforeEach(() => { db.execute.mockReset(); });

const sponsorActions = [['put', '/api/admin/sponsors/2', fields], ['put', '/api/admin/sponsors/2/password', { password: 'new-password' }], ['delete', '/api/admin/sponsors/2', {}]];
it.each(sponsorActions)('protects sponsor action %s %s', async (method, url, body) => {
  await request(app)[method](url).send(body).expect(401);
  for (const user of [users.driver, users.sponsor]) {
    const agent = await signIn(app, user);
    mockQueries([roleLookup]);
    await agent[method](url).send(body).expect(403);
  }
});

it.each(sponsorActions)('limits %s %s to sponsor accounts', async (method, url, body) => {
  const agent = await signIn(app, users.admin);
  mockQueries([["AND role = 'sponsor'", { affectedRows: 0 }], roleLookup]);
  await agent[method](url).send(body).expect(404);
});

it('edits a sponsor account', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([roleLookup, ["AND role = 'sponsor'", { affectedRows: 1 }]]);
  const res = await agent.put('/api/admin/sponsors/2').send(fields).expect(200);
  expect(res.body.sponsor.id).toBe(2);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("AND role = 'sponsor'"), ['new@example.com', 'New', 'User', 2]);
});

it('hashes a sponsor password reset', async () => {
  const agent = await signIn(app, users.admin);
  let stored;
  mockQueries([roleLookup, ["AND role = 'sponsor'", ([hash, id]) => { stored = hash; expect(id).toBe(2); return { affectedRows: 1 }; }]]);
  await agent.put('/api/admin/sponsors/2/password').send({ password: 'new-password' }).expect(200);
  expect(await bcrypt.compare('new-password', stored)).toBe(true);
});

it('deletes a sponsor and reports related-record conflicts', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([["DELETE FROM users WHERE user_id = ? AND role = 'sponsor'", { affectedRows: 1 }], roleLookup]);
  await agent.delete('/api/admin/sponsors/2').expect(204);
  mockQueries([['DELETE FROM users', () => { throw Object.assign(new Error('related'), { code: 'ER_ROW_IS_REFERENCED_2' }); }], roleLookup]);
  await agent.delete('/api/admin/sponsors/2').expect(409);
});

it('restricts sponsor user listing to admins', async () => {
  await request(app).get('/api/admin/sponsors').expect(401);
  for (const user of [users.driver, users.sponsor]) {
    const agent = await signIn(app, user);
    mockQueries([roleLookup]);
    await agent.get('/api/admin/sponsors').expect(403);
  }
});

it('lists sponsor users without exposing password hashes', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([roleLookup, ["WHERE role = 'sponsor' ORDER BY created_at DESC, user_id DESC", [users.sponsor]]]);
  const res = await agent.get('/api/admin/sponsors').expect(200);
  expect(res.body.sponsors).toEqual([{ id: 2, email: 'sponsor@test.com', firstName: 'Sam', lastName: 'Sponsor' }]);
});

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
