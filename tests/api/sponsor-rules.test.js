import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const sponsorRule = { rule_id: 7, sponsor_id: users.sponsor.sponsor_id, pt_value: 25, description: 'Safe driving bonus', frequency: 'one-time' };

describe('sponsor organization point rules', () => {
  it('lists only the signed-in sponsor organization rules', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM users WHERE user_id = ?', [users.sponsor]],
      ['FROM sponsor_rules', [sponsorRule]],
    ]);

    const response = await agent.get('/api/sponsor-rules').expect(200);

    expect(response.body.rules).toEqual([sponsorRule]);
    const [query, params] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM sponsor_rules'));
    expect(query).toContain('WHERE sponsor_id = ?');
    expect(params).toEqual([users.sponsor.sponsor_id]);
  });

  it('lets a sponsor manage a rule owned by their organization regardless of which sponsor login created it', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['SELECT sponsor_id FROM sponsor_rules WHERE rule_id = ?', [{ sponsor_id: users.sponsor.sponsor_id }]],
      ['SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [{ sponsor_id: users.sponsor.sponsor_id }]],
      ['UPDATE sponsor_rules SET sponsor_id', { affectedRows: 1 }],
    ]);

    const response = await agent.put('/api/sponsor-rules/7').send({
      sponsorId: users.sponsor.sponsor_id,
      ptValue: 40,
      description: 'Organization-wide safety bonus',
      frequency: 'one-time',
    }).expect(200);

    expect(response.body.rule).toMatchObject({ rule_id: 7, sponsor_id: users.sponsor.sponsor_id, pt_value: 40 });
  });

  it('does not let a sponsor view, move, or delete another organization rules', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup, ['FROM users WHERE user_id = ?', [users.sponsor]]]);

    await agent.post('/api/sponsor-rules').send({
      sponsorId: 11, ptValue: 10, description: 'Other organization rule', frequency: 'one-time',
    }).expect(403);

    mockQueries([
      roleLookup,
      ['SELECT sponsor_id FROM sponsor_rules WHERE rule_id = ?', [{ sponsor_id: 11 }]],
    ]);
    await agent.put('/api/sponsor-rules/8').send({
      sponsorId: users.sponsor.sponsor_id, ptValue: 10, description: 'Move rule', frequency: 'one-time',
    }).expect(403);

    mockQueries([roleLookup, ['DELETE FROM sponsor_rules', { affectedRows: 0 }]]);
    await agent.delete('/api/sponsor-rules/8').expect(404);
    expect(db.execute.mock.calls.at(-1)[1]).toEqual([8, users.sponsor.sponsor_id]);
  });

  it('keeps the admin list unscoped across organizations', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([
      roleLookup,
      ['FROM users WHERE user_id = ?', [users.admin]],
      ['FROM sponsor_rules', [sponsorRule, { ...sponsorRule, rule_id: 8, sponsor_id: 11 }]],
    ]);

    const response = await agent.get('/api/sponsor-rules').expect(200);
    expect(response.body.rules).toHaveLength(2);
    const [query, params] = db.execute.mock.calls.find(([sql]) => sql.includes('FROM sponsor_rules'));
    expect(query).not.toContain('WHERE sponsor_id = ?');
    expect(params).toEqual([]);
  });
});