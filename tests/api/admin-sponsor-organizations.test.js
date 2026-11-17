import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

const URL = '/api/admin/sponsor-organizations';
const noDuplicate = ['FROM sponsors WHERE LOWER(name)', []];

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const inserts = () => db.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO sponsors'));

describe('admin sponsor organization creation', () => {
  it('is limited to admins', async () => {
    await request(app).post(URL).send({ name: 'Blue Line' }).expect(401);
    for (const user of [users.driver, users.sponsor]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.post(URL).send({ name: 'Blue Line' }).expect(403);
    }
    expect(inserts()).toHaveLength(0);
  });

  it('creates an organization with trimmed fields', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, noDuplicate, ['INSERT INTO sponsors', { insertId: 42 }]]);
    const res = await agent.post(URL)
      .send({ name: '  Blue   Line Freight ', description: ' Regional carrier ', pointConversionRate: '0.02' })
      .expect(201);
    expect(res.body.sponsor).toEqual({
      sponsor_id: 42, name: 'Blue Line Freight', description: 'Regional carrier', point_conversion_rate: 0.02,
    });
    expect(res.body.message).toBe('Sponsor organization Blue Line Freight created.');
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sponsors'), ['Blue Line Freight', 'Regional carrier', 0.02]);
  });

  it('defaults to one cent per point and no description', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, noDuplicate, ['INSERT INTO sponsors', { insertId: 43 }]]);
    await agent.post(URL).send({ name: 'Blue Line' }).expect(201);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sponsors'), ['Blue Line', null, 0.01]);
  });

  it.each([
    [{ name: '   ' }, 'organization name'],
    [{ name: 'x'.repeat(256) }, 'organization name'],
    [{ name: 'Blue Line', pointConversionRate: '0' }, 'dollar value per point'],
    [{ name: 'Blue Line', pointConversionRate: 'abc' }, 'dollar value per point'],
    [{ name: 'Blue Line', description: 'x'.repeat(2001) }, 'description'],
  ])('rejects invalid input %#', async (body, text) => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup]);
    const res = await agent.post(URL).send(body).expect(400);
    expect(res.body.message.toLowerCase()).toContain(text);
    expect(inserts()).toHaveLength(0);
  });

  it('refuses a duplicate name regardless of case', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, ['FROM sponsors WHERE LOWER(name)', [{ sponsor_id: 10 }]]]);
    const res = await agent.post(URL).send({ name: 'acme trucking' }).expect(409);
    expect(res.body.message).toMatch(/already exists/);
    expect(inserts()).toHaveLength(0);
  });

  it('reports a database failure', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, noDuplicate, ['INSERT INTO sponsors', () => { throw new Error('db down'); }]]);
    await agent.post(URL).send({ name: 'Blue Line' }).expect(500);
  });
});
