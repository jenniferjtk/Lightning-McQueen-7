import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin driver management', () => {
  it('requires a session', async () => {
    await request(app).get('/api/admin/drivers').expect(401);
  });

  it('blocks drivers and sponsors', async () => {
    for (const user of [users.driver, users.sponsor]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.get('/api/admin/drivers').expect(403);
    }
  });

  it('lets admins list drivers', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([
      roleLookup,
      ["WHERE role = 'driver'", [{ user_id: 1, email: 'driver@test.com', first_name: 'Dana', last_name: 'Driver', created_at: '2026-09-01' }]],
    ]);

    const res = await agent.get('/api/admin/drivers').expect(200);

    expect(res.body.drivers).toEqual([
      { id: 1, email: 'driver@test.com', firstName: 'Dana', lastName: 'Driver', createdAt: '2026-09-01' },
    ]);
  });

  it('rejects an invalid email when creating a driver', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup]);

    await agent.post('/api/admin/drivers').send({ email: 'not-an-email', password: 'x', firstName: 'A', lastName: 'B' }).expect(400);
  });
});

describe('sponsor point rules', () => {
  const validRule = { sponsorId: 10, ptValue: 25, description: 'No speeding for a week', frequency: 'recurring' };

  it('blocks drivers from creating rules', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent.post('/api/sponsor-rules').send(validRule).expect(403);
  });

  it.each([
    ['a non-integer point value', { ptValue: 2.5 }, /whole number/],
    ['a description over 45 characters', { description: 'x'.repeat(46) }, /45 characters/],
    ['an unknown frequency', { frequency: 'weekly' }, /one-time or recurring/],
    ['a missing sponsor', { sponsorId: undefined }, /valid sponsor/],
  ])('rejects %s', async (_, override, message) => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);

    const res = await agent.post('/api/sponsor-rules').send({ ...validRule, ...override }).expect(400);

    expect(res.body.message).toMatch(message);
  });

  it('creates a valid rule', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM sponsors WHERE sponsor_id = ?', [{ sponsor_id: 10 }]],
      ['INSERT INTO sponsor_rules', { insertId: 7 }],
    ]);

    const res = await agent.post('/api/sponsor-rules').send(validRule).expect(201);

    expect(res.body.rule).toEqual({ rule_id: 7, sponsor_id: 10, pt_value: 25, description: 'No speeding for a week', frequency: 'recurring' });
  });
});
