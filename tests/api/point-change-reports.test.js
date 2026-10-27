import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('point-change reports', () => {
  it('requires authentication to submit a report', async () => {
    await request(app).post('/api/point-change-reports').send({ pointLogId: 12, details: 'Unexpected deduction.' }).expect(401);
  });

  it('allows a driver to report one of their own point changes', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM point_audit_log l', [{
        log_id: 12, affected_user_id: users.driver.user_id, description: 'Late delivery', pt_value: -15,
      }]],
      ['INSERT INTO point_change_reports', { insertId: 8, affectedRows: 1 }],
    ]);

    await agent.post('/api/point-change-reports')
      .send({ pointLogId: 12, details: 'I completed the delivery on time.' })
      .expect(201, { reportId: 8 });

    const [, params] = db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO point_change_reports'));
    expect(params).toEqual([users.driver.user_id, 'driver', 12, users.driver.user_id, 'Late delivery', -15, 'I completed the delivery on time.']);
  });

  it('does not allow a driver to report another driver’s point change', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM point_audit_log l', [{
        log_id: 12, affected_user_id: users.otherDriver.user_id, description: 'Late delivery', pt_value: -15,
      }]],
    ]);

    await agent.post('/api/point-change-reports')
      .send({ pointLogId: 12, details: 'This is not my change.' })
      .expect(403, { message: 'You can only report changes to your own points.' });
  });

  it('allows a sponsor to report a point change for an approved driver in their program', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM point_audit_log l', [{
        log_id: 15, affected_user_id: users.driver.user_id, description: 'Safe driving week', pt_value: 50,
      }]],
      ['FROM driver_applications WHERE driver_user_id = ?', [{ application_id: 44 }]],
      ['INSERT INTO point_change_reports', { insertId: 9, affectedRows: 1 }],
    ]);

    await agent.post('/api/point-change-reports')
      .send({ pointLogId: 15, details: 'The date does not match the delivery record.' })
      .expect(201, { reportId: 9 });
    expect(db.execute.mock.calls.find(([sql]) => sql.includes('FROM driver_applications WHERE driver_user_id = ?'))[1])
      .toEqual([users.driver.user_id, users.sponsor.sponsor_id]);
  });

  it('does not allow a sponsor to report a driver outside its program', async () => {
    const agent = await signIn(app, users.sponsor);
    mockQueries([
      roleLookup,
      ['FROM point_audit_log l', [{
        log_id: 15, affected_user_id: users.otherDriver.user_id, description: 'Safe driving week', pt_value: 50,
      }]],
      ['FROM driver_applications WHERE driver_user_id = ?', []],
    ]);

    await agent.post('/api/point-change-reports')
      .send({ pointLogId: 15, details: 'Suspicious.' })
      .expect(403, { message: 'This driver is not in your sponsor program.' });
  });

  it('validates the reported change and explanation', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup]);

    await agent.post('/api/point-change-reports').send({ pointLogId: 0, details: 'x' }).expect(400);
    await agent.post('/api/point-change-reports').send({ pointLogId: 12, details: ' ' }).expect(400);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it('makes reports available to admins only', async () => {
    const driverAgent = await signIn(app, users.driver);
    mockQueries([roleLookup]);
    await driverAgent.get('/api/admin/point-change-reports').expect(403);

    const adminAgent = await signIn(app, users.admin);
    mockQueries([
      ['SELECT role FROM users', [users.admin]],
      ['FROM point_change_reports r', [{
        id: 8, reporterRole: 'driver', description: 'Late delivery', amount: '-15', details: 'Incorrect.',
        date: 'Oct 27, 2026', driverName: 'Dana Driver', reporterName: 'Dana Driver',
      }]],
    ]);
    const response = await adminAgent.get('/api/admin/point-change-reports').expect(200);
    expect(response.body.reports).toEqual([{
      id: 8, reporterRole: 'driver', description: 'Late delivery', amount: -15, details: 'Incorrect.',
      date: 'Oct 27, 2026', driverName: 'Dana Driver', reporterName: 'Dana Driver',
    }]);
  });
});
