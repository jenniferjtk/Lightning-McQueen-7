import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sponsor driver list', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/sponsor/drivers').expect(401);
  });

  it('only exposes approved drivers in the signed-in sponsor organization with point balances', async () => {
    const agent = await signIn(app, users.sponsor);
    const driver = {
      id: users.driver.user_id,
      firstName: users.driver.first_name,
      lastName: users.driver.last_name,
      email: users.driver.email,
      createdAt: '2026-10-01',
      points: '125',
      applicationId: 44,
      status: 'approved',
      submittedAt: '2026-10-01T12:00:00.000Z',
      decidedAt: '2026-10-02T12:00:00.000Z',
      sponsorName: 'Acme Trucking',
    };
    mockQueries([
      ['SELECT role, sponsor_id FROM users', [users.sponsor]],
      ['FROM driver_applications a', [driver]],
    ]);

    const response = await agent.get('/api/sponsor/drivers').expect(200);

    expect(response.body).toEqual({ sponsorLinked: true, drivers: [{ ...driver, points: 125 }] });
    const listQuery = db.execute.mock.calls.find(([sql]) => sql.includes('FROM driver_applications a'));
    expect(listQuery[1]).toEqual([users.sponsor.sponsor_id]);
    expect(listQuery[0]).toContain("a.status = 'approved'");
    expect(listQuery[0]).toContain('point_audit_log');
    expect(listQuery[0]).toContain('points.sponsor_id = a.sponsor_id');
    expect(listQuery[0]).toContain('spent.sponsor_id = a.sponsor_id');
    expect(listQuery[0]).toContain('a.application_id AS applicationId');
    expect(listQuery[0]).toContain('a.submitted_at AS submittedAt');
  });

  it('rejects non-sponsor accounts', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([['SELECT role, sponsor_id FROM users', [users.driver]]]);

    await agent.get('/api/sponsor/drivers').expect(403);
  });

  it('returns an empty list when the sponsor account is not linked to an organization', async () => {
    const agent = await signIn(app, { ...users.sponsor, sponsor_id: null });
    mockQueries([['SELECT role, sponsor_id FROM users', [{ ...users.sponsor, sponsor_id: null }]]]);

    await agent.get('/api/sponsor/drivers').expect(200, { sponsorLinked: false, drivers: [] });
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

describe('sponsor driver point history', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/sponsor/drivers/1/points/trend').expect(401);
  });

  it('only allows sponsors to view approved drivers in their organization', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE driver_user_id = ?', []],
    ]);

    await agent.get('/api/sponsor/drivers/4/points/trend')
      .expect(403, { message: 'This driver is not in your sponsor program.' });
    expect(db.execute.mock.calls[1][1]).toEqual([users.otherDriver.user_id, users.sponsor.sponsor_id]);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it('returns the approved driver’s cumulative points by date', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE driver_user_id = ?', [{ application_id: 44 }]],
      ["GROUP BY DATE_FORMAT(l.timestamp, '%Y-%m-%d')", [
        { date: '2026-09-01', change_amount: '50' },
        { date: '2026-09-03', change_amount: '-30' },
      ]],
    ]);

    const response = await agent.get('/api/sponsor/drivers/1/points/trend').expect(200);

    expect(response.body).toEqual([
      { date: '2026-09-01', cumulative_total: 50 },
      { date: '2026-09-03', cumulative_total: 20 },
    ]);
    expect(db.execute.mock.calls[2][1]).toEqual([users.driver.user_id]);
  });

  it('rejects invalid driver ids', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([roleLookup]);

    await agent.get('/api/sponsor/drivers/not-a-driver/points/trend')
      .expect(400, { message: 'Invalid driver account.' });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects non-sponsor accounts', async () => {
    const agent = await signIn(app, users.driver);
    db.execute.mockClear();
    mockQueries([roleLookup]);

    await agent.get('/api/sponsor/drivers/1/points/trend').expect(403);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});

describe('sponsor driver point entries', () => {
  it('returns recent entries only for approved drivers in the sponsor program', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE driver_user_id = ?', [{ application_id: 44 }]],
      ['FROM point_audit_log l', [{
        id: 12, label: 'Late delivery', amount: '-15', date: 'Oct 27, 2026',
      }]],
    ]);

    const response = await agent.get('/api/sponsor/drivers/1/points/entries').expect(200);

    expect(response.body.entries).toEqual([{ id: 12, label: 'Late delivery', amount: -15, date: 'Oct 27, 2026' }]);
    expect(db.execute.mock.calls[1][1]).toEqual([users.driver.user_id, users.sponsor.sponsor_id]);
    expect(db.execute.mock.calls[2][1]).toEqual([users.driver.user_id]);
    expect(db.execute.mock.calls[2][0]).toContain('LIMIT 20');
  });

  it('denies access to drivers outside the sponsor program', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE driver_user_id = ?', []],
    ]);

    await agent.get('/api/sponsor/drivers/4/points/entries')
      .expect(403, { message: 'This driver is not in your sponsor program.' });
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

describe('sponsor driver redemption history', () => {
  it('lists orders only for an approved driver in the sponsor organization', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    const redemption = {
      order_id: 51, sponsor_id: users.sponsor.sponsor_id, sponsor_name: 'Acme Trucking', product_id: 9,
      product_title: 'Hard Drive', unit_price: '64.00', point_cost: 6400, status: 'pending', created_at: '2026-11-15T12:00:00Z',
    };
    mockQueries([
      roleLookup,
      ['FROM driver_applications WHERE driver_user_id = ?', [{ application_id: 44 }]],
      ['FROM orders o', [redemption]],
    ]);

    const response = await agent.get('/api/sponsor/drivers/1/orders').expect(200);
    expect(response.body.orders).toEqual([{
      orderId: 51, sponsorId: users.sponsor.sponsor_id, sponsorName: 'Acme Trucking', productId: 9,
      productTitle: 'Hard Drive', unitPrice: 64, pointCost: 6400, status: 'pending', createdAt: redemption.created_at,
    }]);
    expect(db.execute.mock.calls.at(-1)[1]).toEqual([users.driver.user_id, users.sponsor.sponsor_id]);
  });

  it('does not expose orders for drivers outside the sponsor organization', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([roleLookup, ['FROM driver_applications WHERE driver_user_id = ?', []]]);

    await agent.get('/api/sponsor/drivers/4/orders').expect(403);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

describe('sponsor driver removal', () => {
  it('requires a reason and removes only an approved driver in this sponsor program', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['SELECT application_id FROM driver_applications', [{ application_id: 44 }]],
      ['UPDATE driver_applications SET status', { affectedRows: 1 }],
      ['INSERT INTO sponsor_driver_removals', { insertId: 12 }],
      ['INSERT INTO driver_notifications', { insertId: 13 }],
    ]);

    await agent.post('/api/sponsor/drivers/1/drop').send({ reason: '  Repeated policy violations  ' }).expect(200, {
      message: 'Driver removed from your organization.',
    });
    expect(db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO sponsor_driver_removals'))[1])
      .toEqual([users.driver.user_id, users.sponsor.sponsor_id, users.sponsor.user_id, 'Repeated policy violations']);
    expect(db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO driver_notifications'))[1])
      .toEqual([users.driver.user_id, users.sponsor.sponsor_id]);
    expect(db.commit).toHaveBeenCalledOnce();
  });

  it('rejects a blank reason and does not change application status', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([roleLookup]);

    await agent.post('/api/sponsor/drivers/1/drop').send({ reason: '   ' }).expect(400);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('is sponsor-only', async () => {
    const driverAgent = await signIn(app, users.driver);
    db.execute.mockClear();
    mockQueries([roleLookup]);
    await driverAgent.post('/api/sponsor/drivers/1/drop').send({ reason: 'Reason' }).expect(403);
  });
});

describe('sponsor weekly point changes', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/sponsor/points/weekly').expect(401);
  });

  it('returns a seven-day aggregate scoped to the sponsor’s approved drivers', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['SELECT DATE_FORMAT(CURDATE()', [{ today: '2026-10-27' }]],
      ['FROM point_audit_log l', [
        { date: '2026-10-22', gains: '50', losses: '-30' },
        { date: '2026-10-23', gains: '0', losses: '-5' },
        { date: '2026-10-25', gains: '15', losses: '0' },
        { date: '2026-10-27', gains: '10', losses: '0' },
      ]],
    ]);

    const response = await agent.get('/api/sponsor/points/weekly').expect(200);

    expect(response.body).toEqual([
      { date: '2026-10-21', gains: 0, losses: 0 },
      { date: '2026-10-22', gains: 50, losses: -30 },
      { date: '2026-10-23', gains: 0, losses: -5 },
      { date: '2026-10-24', gains: 0, losses: 0 },
      { date: '2026-10-25', gains: 15, losses: 0 },
      { date: '2026-10-26', gains: 0, losses: 0 },
      { date: '2026-10-27', gains: 10, losses: 0 },
    ]);
    const [sql, params] = db.execute.mock.calls[2];
    expect(params).toEqual([users.sponsor.sponsor_id]);
    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain('l.timestamp >= CURDATE() - INTERVAL 6 DAY');
    expect(sql).toContain('l.timestamp < CURDATE() + INTERVAL 1 DAY');
    expect(sql).toContain('FROM driver_applications');
    expect(sql).toContain('SUM(CASE WHEN r.pt_value > 0');
    expect(sql).toContain('SUM(CASE WHEN r.pt_value < 0');
  });

  it('rejects non-sponsor accounts', async () => {
    const agent = await signIn(app, users.driver);
    db.execute.mockClear();
    mockQueries([roleLookup]);

    await agent.get('/api/sponsor/points/weekly').expect(403);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});

describe('sponsor point transaction backlog', () => {
  it('returns all point-rule transactions belonging to the signed-in sponsor', async () => {
    const agent = await signIn(app, users.sponsor);
    db.execute.mockClear();
    mockQueries([
      roleLookup,
      ['FROM point_audit_log l', [{
        id: 12, driverName: 'Dana Driver', label: 'Late delivery', amount: '-15', date: 'Oct 27, 2026',
      }]],
    ]);

    const response = await agent.get('/api/sponsor/points/transactions').expect(200);

    expect(response.body).toEqual({ entries: [{
      id: 12, driverName: 'Dana Driver', label: 'Late delivery', amount: -15, date: 'Oct 27, 2026',
    }] });
    const [query, params] = db.execute.mock.calls[1];
    expect(params).toEqual([users.sponsor.sponsor_id]);
    expect(query).toContain('r.sponsor_id = ?');
    expect(query).toContain('ORDER BY l.timestamp DESC, l.log_id DESC');
  });

  it('rejects non-sponsor accounts', async () => {
    const agent = await signIn(app, users.driver);
    db.execute.mockClear();
    mockQueries([roleLookup]);

    await agent.get('/api/sponsor/points/transactions').expect(403);
  });
});
