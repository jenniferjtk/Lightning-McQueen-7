import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, PASSWORD, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/auth/register', () => {
  const newDriver = { email: ' New@Test.com ', password: 'longenough', firstName: 'Nia', lastName: 'New' };

  it('rejects missing fields', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com' }).expect(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...newDriver, password: 'short' }).expect(400);
    expect(res.body.message).toMatch(/at least 8/);
  });

  it('creates a driver, normalizes the email, and stores only a hash', async () => {
    mockQueries([['INSERT INTO users', { insertId: 42 }]]);

    const res = await request(app).post('/api/auth/register').send(newDriver).expect(201);

    expect(res.body.user).toMatchObject({ id: 42, email: 'new@test.com', role: 'driver' });
    const [, params] = db.execute.mock.calls[0];
    expect(params[0]).toBe('new@test.com');
    expect(params[1]).not.toBe(newDriver.password);
    expect(params[1]).toMatch(/^\$2[aby]\$/);
  });

  it('returns 409 when the email is already registered', async () => {
    db.execute.mockRejectedValue(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));

    await request(app).post('/api/auth/register').send(newDriver).expect(409);
  });
});

describe('POST /api/auth/login', () => {
  it('rejects a wrong password', async () => {
    mockQueries([['FROM users WHERE email = ?', [users.driver]]]);

    await request(app).post('/api/auth/login').send({ email: users.driver.email, password: 'wrong-password' }).expect(401);
  });

  it('rejects an unknown email', async () => {
    mockQueries([['FROM users WHERE email = ?', []]]);

    await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: PASSWORD }).expect(401);
  });

  it('signs in and never returns the password hash', async () => {
    mockQueries([['FROM users WHERE email = ?', [users.driver]]]);

    const res = await request(app).post('/api/auth/login').send({ email: users.driver.email, password: PASSWORD }).expect(200);

    expect(res.body.user).toEqual({
      id: 1, email: 'driver@test.com', role: 'driver', firstName: 'Dana', lastName: 'Driver', sponsorId: null,
    });
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('sessions', () => {
  it('GET /api/auth/me returns 401 without a session', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('GET /api/auth/me returns the signed-in user', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    const res = await agent.get('/api/auth/me').expect(200);

    expect(res.body.user.email).toBe('driver@test.com');
  });

  it('logout ends the session', async () => {
    const agent = await signIn(app, users.driver);

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });
});
