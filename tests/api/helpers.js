import { vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';

// Stand-in for the mysql2 pool, so API tests run without a database.
// Each test file mocks mysql2 with this before importing the app:
//
//   vi.mock('mysql2/promise', () => mysqlMock);
//   const { app } = await import('../../index.js');
export const db = { execute: vi.fn() };
export const mysqlMock = { default: { createPool: () => db } };

// Answers each query with the first handler whose text appears in the SQL.
// A handler is a result row array, or a function of the query params that
// returns one. Unexpected queries fail the test so nothing passes by accident.
export function mockQueries(handlers) {
  db.execute.mockImplementation(async (sql, params) => {
    for (const [text, result] of handlers) {
      if (sql.includes(text)) return [typeof result === 'function' ? result(params) : result];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

// Low cost factor keeps tests fast; bcrypt.compare works with any cost.
export const PASSWORD = 'correct-horse';
export const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

export const users = {
  driver: { user_id: 1, email: 'driver@test.com', role: 'driver', first_name: 'Dana', last_name: 'Driver', sponsor_id: null, password_hash: PASSWORD_HASH },
  sponsor: { user_id: 2, email: 'sponsor@test.com', role: 'sponsor', first_name: 'Sam', last_name: 'Sponsor', sponsor_id: 10, password_hash: PASSWORD_HASH },
  admin: { user_id: 3, email: 'admin@test.com', role: 'admin', first_name: 'Ada', last_name: 'Admin', sponsor_id: null, password_hash: PASSWORD_HASH },
};

const byId = (id) => Object.values(users).filter((user) => user.user_id === Number(id));

// Returns a Supertest agent holding a session cookie for the given user.
export async function signIn(app, user) {
  const agent = request.agent(app);
  mockQueries([['FROM users WHERE email = ?', [user]]]);
  await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
  return agent;
}

// Role lookups the auth middleware makes on every protected request.
export const roleLookup = ['FROM users WHERE user_id = ?', ([id]) => byId(id)];
