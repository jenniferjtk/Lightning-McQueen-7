import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('driver shipping address', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/driver/shipping-address').expect(401);
    await request(app).put('/api/driver/shipping-address').send({}).expect(401);
  });

  it('returns only the signed-in driver address', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, ['SELECT shipping_address', [{
      shipping_address: '123 Main Street', shipping_city: 'Clemson', shipping_state: 'SC',
      shipping_postal_code: '29631', shipping_country: 'United States',
    }]]]);

    const response = await agent.get('/api/driver/shipping-address').expect(200);
    expect(response.body.address).toEqual({
      streetAddress: '123 Main Street', city: 'Clemson', state: 'SC', zipCode: '29631', country: 'United States',
    });
    expect(db.execute.mock.calls.find(([sql]) => sql.includes('SELECT shipping_address'))[1]).toEqual([users.driver.user_id]);
  });

  it('saves a validated address to the signed-in driver only', async () => {
    const agent = await signIn(app, users.driver);
    mockQueries([roleLookup, ['UPDATE users\n       SET shipping_address', { affectedRows: 1 }]]);

    const response = await agent.put('/api/driver/shipping-address').send({
      streetAddress: ' 123 Main Street ', city: ' Clemson ', state: ' SC ', zipCode: ' 29631 ', country: ' United States ',
    }).expect(200);
    expect(response.body.address).toEqual({
      streetAddress: '123 Main Street', city: 'Clemson', state: 'SC', zipCode: '29631', country: 'United States',
    });
    expect(db.execute.mock.calls.at(-1)[1]).toEqual(['123 Main Street', 'Clemson', 'SC', '29631', 'United States', users.driver.user_id]);
  });

  it('rejects non-drivers and incomplete or oversized addresses', async () => {
    const sponsorAgent = await signIn(app, users.sponsor);
    mockQueries([roleLookup]);
    await sponsorAgent.get('/api/driver/shipping-address').expect(403);

    const driverAgent = await signIn(app, users.driver);
    mockQueries([roleLookup]);
    await driverAgent.put('/api/driver/shipping-address').send({ streetAddress: '', city: '', state: '', zipCode: '', country: '' }).expect(400);
    await driverAgent.put('/api/driver/shipping-address').send({
      streetAddress: 'x'.repeat(256), city: 'Clemson', state: 'SC', zipCode: '29631', country: 'United States',
    }).expect(400);
  });
});