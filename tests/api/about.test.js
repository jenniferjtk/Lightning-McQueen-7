import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db, mockQueries, mysqlMock } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

describe('GET /api/about', () => {
  beforeEach(() => {
    db.execute.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns the latest sprint release', async () => {
    mockQueries([['FROM about_page', [{ sprintNumber: 5, releaseDate: '10/07/2026' }]]]);

    const res = await request(app).get('/api/about').expect(200);

    expect(res.body).toEqual({ sprintNumber: 5, releaseDate: '10/07/2026' });
  });

  it('returns 404 when no release has been recorded', async () => {
    mockQueries([['FROM about_page', []]]);

    const res = await request(app).get('/api/about').expect(404);

    expect(res.body.message).toMatch(/no sprint release/i);
  });

  it('returns 500 when the database is unreachable', async () => {
    db.execute.mockRejectedValue(new Error('connect ETIMEDOUT'));

    await request(app).get('/api/about').expect(500);
  });
});
