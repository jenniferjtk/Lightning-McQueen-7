import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('driver notifications', () => {
  it('lists unread notifications for only the signed-in driver', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([
      roleLookup,
      ['FROM driver_notifications n', [{ id: 8, type: 'application_approved', sponsorName: 'Roadrunner Logistics', createdAt: '2026-11-17T12:00:00Z' }]],
    ]);

    const response = await agent.get('/api/driver/notifications').expect(200);
    expect(response.body.notifications).toEqual([
      { id: 8, type: 'application_approved', sponsorName: 'Roadrunner Logistics', createdAt: '2026-11-17T12:00:00Z' },
    ]);
    expect(db.execute.mock.calls.find(([sql]) => sql.includes('FROM driver_notifications n'))[1]).toEqual([users.driver.user_id]);
  });

  it('marks a notification read only for its owner', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, ['UPDATE driver_notifications SET read_at', { affectedRows: 1 }]]);

    await agent.patch('/api/driver/notifications/8/read').expect(204);
    expect(db.execute.mock.calls.at(-1)[1]).toEqual([8, users.driver.user_id]);
  });

  it('is driver-only', async () => {
    await request(app).get('/api/driver/notifications').expect(401);
    const agent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);
    await agent.get('/api/driver/notifications').expect(403);
  });
});