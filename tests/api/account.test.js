import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const calls = (text) => db.execute.mock.calls.filter(([sql]) => sql.includes(text));
const body = { firstName: ' Samantha ', lastName: ' Sponsor ', email: ' Sam@Example.com ', phone: ' (864) 555-0100 ' };

describe('GET /api/account', () => {
  it('requires a session', async () => {
    await request(app).get('/api/account').expect(401);
  });

  it("returns the signed-in user's saved profile, phone included", async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([['SELECT first_name, last_name, email, phone FROM users', [{ first_name: 'Sam', last_name: 'Sponsor', email: 'sponsor@test.com', phone: null }]]]);
    const res = await agent.get('/api/account').expect(200);
    expect(res.body.account).toEqual({ firstName: 'Sam', lastName: 'Sponsor', email: 'sponsor@test.com', phone: '' });
    expect(calls('SELECT first_name')[0][1]).toEqual([users.sponsor.user_id]);
  });
});

describe('PUT /api/account', () => {
  it('requires a session', async () => {
    await request(app).put('/api/account').send(body).expect(401);
  });

  it('saves trimmed fields for the session user only, ignoring any id in the body', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      ['WHERE email = ? AND user_id <> ?', []],
      ['UPDATE users SET first_name', { affectedRows: 1 }],
    ]);
    const res = await agent.put('/api/account').send({ ...body, userId: 99 }).expect(200);
    expect(res.body.account).toEqual({ firstName: 'Samantha', lastName: 'Sponsor', email: 'sam@example.com', phone: '(864) 555-0100' });
    expect(calls('UPDATE users SET first_name')[0][1]).toEqual(['Samantha', 'Sponsor', 'sam@example.com', '(864) 555-0100', users.sponsor.user_id]);
  });

  it('stores a blank phone as NULL', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      ['WHERE email = ? AND user_id <> ?', []],
      ['UPDATE users SET first_name', { affectedRows: 1 }],
    ]);
    await agent.put('/api/account').send({ ...body, phone: '' }).expect(200);
    expect(calls('UPDATE users SET first_name')[0][1][3]).toBeNull();
  });

  it.each([
    [{ ...body, firstName: '  ' }, 'first and last name'],
    [{ ...body, email: 'not-an-email' }, 'valid email'],
    [{ ...body, phone: '12345' }, 'phone number'],
    [{ ...body, phone: 'call me' }, 'phone number'],
  ])('rejects invalid input %#', async (input, text) => {
    const agent = await signIn(app, users.driver);
    mockQueries([]);
    const res = await agent.put('/api/account').send(input).expect(400);
    expect(res.body.message.toLowerCase()).toContain(text);
    expect(calls('UPDATE users')).toHaveLength(0);
  });

  it("refuses an email another account uses", async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([['WHERE email = ? AND user_id <> ?', [{ user_id: 4 }]]]);
    const res = await agent.put('/api/account').send(body).expect(409);
    expect(res.body.message).toMatch(/already uses that email/);
    expect(calls('UPDATE users')).toHaveLength(0);
  });

  it('reports a database failure', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      ['WHERE email = ? AND user_id <> ?', []],
      ['UPDATE users SET first_name', () => { throw new Error('Unknown column phone'); }],
    ]);
    await agent.put('/api/account').send(body).expect(500);
  });
});
