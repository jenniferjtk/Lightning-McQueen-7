import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const noSponsorUserId = () => db.execute.mock.calls.every(([sql]) => !sql.includes('sponsor_user_id'));

describe('sponsor point conversion', () => {
  const linkedSponsor = ['JOIN sponsors s ON s.sponsor_id = u.sponsor_id', ([id]) => (
    id === users.sponsor.user_id ? [{ sponsor_id: 10, name: 'Acme Freight' }] : []
  )];

  it('requires a session', async () => {
    await request(app).get('/api/sponsor/conversion').expect(401);
  });

  it('resolves the organization from users.sponsor_id', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([linkedSponsor, ['SELECT name, point_conversion_rate FROM sponsors', [{ name: 'Acme Freight', point_conversion_rate: '0.0100' }]]]);
    const res = await agent.get('/api/sponsor/conversion').expect(200);
    expect(res.body).toEqual({ sponsorName: 'Acme Freight', pointConversionRate: '0.0100' });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('point_conversion_rate FROM sponsors'), [10]);
    expect(noSponsorUserId()).toBe(true);
  });

  it('updates only the linked organization', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([linkedSponsor, ['UPDATE sponsors SET point_conversion_rate', { affectedRows: 1 }]]);
    const res = await agent.put('/api/sponsor/conversion').send({ pointConversionRate: '0.02', sponsorId: 99 }).expect(200);
    expect(res.body).toEqual({ sponsorName: 'Acme Freight', pointConversionRate: 0.02 });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE sponsors'), [0.02, 10]);
  });

  it('rejects drivers and unlinked sponsors', async () => {
    for (const user of [users.driver, { ...users.sponsor, user_id: 5, sponsor_id: null }]) {
      const agent = await signIn(app, user);
      mockQueries([linkedSponsor]);
      await agent.get('/api/sponsor/conversion').expect(403);
    }
  });
});

describe('admin sponsor account links', () => {
  it('is limited to admins', async () => {
    await request(app).get('/api/admin/sponsor-links').expect(401);
    for (const user of [users.driver, users.sponsor]) {
      const agent = await signIn(app, user);
      mockQueries([roleLookup]);
      await agent.get('/api/admin/sponsor-links').expect(403);
      await agent.put('/api/admin/sponsor-links/2').send({ sponsorId: 10 }).expect(403);
    }
  });

  it('lists organizations and sponsor accounts with their sponsor_id', async () => {
    const agent = await signIn(app, users.admin);
    const account = { user_id: 2, email: 'sponsor@test.com', first_name: 'Sam', last_name: 'Sponsor', sponsor_id: 10 };
    mockQueries([
      roleLookup,
      ['FROM sponsors ORDER BY name', [{ sponsor_id: 10, name: 'Acme Freight' }]],
      ["FROM users WHERE role = 'sponsor'", [account]],
    ]);
    const res = await agent.get('/api/admin/sponsor-links').expect(200);
    expect(res.body).toEqual({ sponsors: [{ sponsor_id: 10, name: 'Acme Freight' }], sponsorUsers: [account] });
    expect(noSponsorUserId()).toBe(true);
  });

  it('links and unlinks a sponsor account through users.sponsor_id', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, ['FROM sponsors WHERE sponsor_id = ?', [{ sponsor_id: 10 }]], ['UPDATE users SET sponsor_id', { affectedRows: 1 }]]);
    await agent.put('/api/admin/sponsor-links/2').send({ sponsorId: '10' }).expect(200);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("AND role = 'sponsor'"), [10, 2]);
    await agent.put('/api/admin/sponsor-links/2').send({ sponsorId: null }).expect(200);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE users SET sponsor_id'), [null, 2]);
    expect(noSponsorUserId()).toBe(true);
  });

  it('validates the account and organization', async () => {
    const agent = await signIn(app, users.admin);
    mockQueries([roleLookup, ['FROM sponsors WHERE sponsor_id = ?', []], ['UPDATE users SET sponsor_id', { affectedRows: 0 }]]);
    await agent.put('/api/admin/sponsor-links/abc').send({ sponsorId: 10 }).expect(400);
    await agent.put('/api/admin/sponsor-links/2').send({ sponsorId: 'x' }).expect(400);
    await agent.put('/api/admin/sponsor-links/2').send({ sponsorId: 99 }).expect(404);
    await agent.put('/api/admin/sponsor-links/1').send({ sponsorId: null }).expect(404);
  });
});
