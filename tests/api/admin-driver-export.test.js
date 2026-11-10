import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  db.getConnection.mockClear();
});

it('only allows admins to download the complete driver CSV', async () => {
  await request(app).get('/api/admin/drivers.csv').expect(401);
  const driver = await signIn(app, users.driver);
  mockQueries([roleLookup]);
  await driver.get('/api/admin/drivers.csv').expect(403);
});

it('downloads all drivers as a spreadsheet-safe CSV', async () => {
  const agent = await signIn(app, users.admin);
  mockQueries([
    roleLookup,
    ['FROM users u', [{
      user_id: 1,
      first_name: '=Dana',
      last_name: 'Driver',
      email: 'dana@example.com',
      affiliation: 'Acme, Inc.',
      created_at: '2026-10-01',
    }]],
  ]);

  const response = await agent.get('/api/admin/drivers.csv').expect(200);

  expect(response.headers['content-type']).toContain('text/csv');
  expect(response.headers['content-disposition']).toContain('attachment; filename="drivers.csv"');
  expect(response.text).toBe('\uFEFF"Driver ID","First name","Last name","Email","Sponsor affiliation","Joined"\r\n"1","\'=Dana","Driver","dana@example.com","Acme, Inc.","2026-10-01"');
});
