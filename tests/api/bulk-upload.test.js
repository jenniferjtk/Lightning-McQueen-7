import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { db, mockQueries, mysqlMock, roleLookup, signIn, users } from './helpers.js';

vi.mock('mysql2/promise', () => mysqlMock);
const { app } = await import('../../index.js');

beforeEach(() => {
  db.execute.mockReset();
  for (const fn of [db.getConnection, db.beginTransaction, db.commit, db.rollback, db.release]) fn.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const SPONSOR_ID = users.sponsor.sponsor_id;
const HEADER = 'email,first_name,last_name,role,password';
const calls = (text) => db.execute.mock.calls.filter(([sql]) => sql.includes(text));

let nextId = 100;
const insertUser = ['INSERT INTO users', () => ({ insertId: nextId++ })];
const insertApplication = ['INSERT INTO driver_applications', { affectedRows: 1 }];
const noExistingEmails = ['SELECT email FROM users WHERE email IN', []];

async function upload(csv, { as = users.sponsor, handlers = [noExistingEmails, insertUser, insertApplication] } = {}) {
  const agent = await signIn(app, as);
  mockQueries([roleLookup, ...handlers]);
  return agent.post('/api/sponsor/users/bulk').send({ csv });
}

describe('sponsor bulk user upload', () => {
  it('creates every user in a valid batch, normalized, inside one transaction', async () => {
    nextId = 100;
    const csv = [
      'Email, First Name ,last_name,ROLE,Password,',
      '  Ann.Driver@Example.COM ,  Ann ,  Lee   Smith ,Driver,driver-pass-1,',
      '"bob@example.com","Bob","Jones, Jr.",sponsor,sponsor-pass-2,',
      '',
    ].join('\r\n');

    const res = await upload(csv);

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
    expect(res.body.created).toEqual([
      { row: 2, id: 100, email: 'ann.driver@example.com', role: 'driver', firstName: 'Ann', lastName: 'Lee Smith' },
      { row: 3, id: 101, email: 'bob@example.com', role: 'sponsor', firstName: 'Bob', lastName: 'Jones, Jr.' },
    ]);

    const [driverInsert, sponsorInsert] = calls('INSERT INTO users');
    expect(driverInsert[1]).toEqual(['ann.driver@example.com', expect.any(String), 'driver', 'Ann', 'Lee Smith', null]);
    expect(sponsorInsert[1]).toEqual(['bob@example.com', expect.any(String), 'sponsor', 'Bob', 'Jones, Jr.', SPONSOR_ID]);
    // Passwords are stored only as bcrypt hashes of exactly what was typed.
    expect(await bcrypt.compare('driver-pass-1', driverInsert[1][1])).toBe(true);
    expect(driverInsert[1][1]).not.toContain('driver-pass-1');

    // The driver joins the uploading sponsor's program as an approved application.
    const applications = calls('INSERT INTO driver_applications');
    expect(applications).toHaveLength(1);
    expect(applications[0][0]).toContain("'approved'");
    expect(applications[0][1]).toEqual([100, SPONSOR_ID]);

    expect(db.beginTransaction).toHaveBeenCalledTimes(1);
    expect(db.commit).toHaveBeenCalledTimes(1);
    expect(db.rollback).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it('rejects the whole batch with a per-row report when any row is blank or malformed', async () => {
    const csv = [
      HEADER,
      'good@example.com,Good,Row,driver,good-pass-1',
      'no-at-sign.example.com,Bad,Email,driver,bad-pass-12',
      'blank@example.com,   ,Name,driver,blank-pass-1',
      'short@example.com,Short,Password,driver,abc',
      'spaces@example.com,Only,Spaces,driver,     ',
    ].join('\n');

    const res = await upload(csv);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No users were created. Fix the rows below and upload the file again.');
    expect(res.body.errors).toEqual([
      { row: 3, email: 'no-at-sign.example.com', message: 'A first name, last name, valid email, and password are required.' },
      { row: 4, email: 'blank@example.com', message: 'A first name, last name, valid email, and password are required.' },
      { row: 5, email: 'short@example.com', message: 'Password must be at least 8 characters.' },
      { row: 6, email: 'spaces@example.com', message: 'A first name, last name, valid email, and password are required.' },
    ]);
    // The valid row on line 2 was not inserted either.
    expect(calls('INSERT')).toHaveLength(0);
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('blocks rows that attribute users to another sponsor organization', async () => {
    const csv = [
      `${HEADER},sponsor_id`,
      `mine@example.com,Mine,Row,driver,mine-pass-1,${SPONSOR_ID}`,
      'theirs@example.com,Their,Row,sponsor,their-pass-1,11',
    ].join('\n');

    const res = await upload(csv);

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { row: 3, email: 'theirs@example.com', message: 'Users can only be added to your own sponsor organization.' },
    ]);
    expect(calls('INSERT')).toHaveLength(0);
  });

  it('only allows driver and sponsor accounts, never admins', async () => {
    const res = await upload(`${HEADER}\nboss@example.com,Big,Boss,admin,admin-pass-1`);

    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toBe('Choose a driver or sponsor role.');
  });

  it('reports emails that already have accounts or repeat within the file', async () => {
    const csv = [
      HEADER,
      'taken@example.com,Taken,Already,driver,taken-pass-1',
      'twice@example.com,First,Copy,driver,twice-pass-1',
      'TWICE@example.com,Second,Copy,driver,twice-pass-2',
    ].join('\n');

    const res = await upload(csv, { handlers: [['SELECT email FROM users WHERE email IN', [{ email: 'taken@example.com' }]]] });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { row: 2, email: 'taken@example.com', message: 'An account with this email already exists.' },
      { row: 4, email: 'twice@example.com', message: 'This email appears more than once in the file.' },
    ]);
    expect(calls('SELECT email FROM users WHERE email IN')[0][1]).toEqual(['taken@example.com', 'twice@example.com']);
  });

  it('rolls back every insert if the database fails partway through', async () => {
    nextId = 200;
    const csv = [HEADER, 'one@example.com,One,Row,driver,one-pass-12', 'two@example.com,Two,Row,driver,two-pass-12'].join('\n');
    let userInserts = 0;
    const res = await upload(csv, {
      handlers: [
        noExistingEmails,
        ['INSERT INTO users', () => {
          userInserts += 1;
          if (userInserts === 2) throw new Error('connection lost');
          return { insertId: nextId++ };
        }],
        insertApplication,
      ],
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Unable to create these users. No users were created.');
    expect(db.rollback).toHaveBeenCalledTimes(1);
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it('explains a missing or unknown column', async () => {
    const res = await upload('email,first_name,role,password,phone\na@example.com,A,driver,a-pass-123,555');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Missing column(s): last_name. Unknown column(s): phone. Expected columns: email, first_name, last_name, role, password (sponsor_id optional).');
  });

  it('limits the number of users per upload', async () => {
    const rows = Array.from({ length: 16 }, (_, index) => `user${index}@example.com,User,${index},driver,user-pass-${index}`);
    const res = await upload([HEADER, ...rows].join('\n'));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Upload at most 15 users at a time (this file has 16).');
  });

  it('rejects an empty file or an unclosed quote', async () => {
    expect((await upload('')).status).toBe(400);
    expect((await upload(HEADER)).body.message).toBe('The file has no users in it.');
    expect((await upload(`${HEADER}\n"oops@example.com,A,B,driver,pass-1234`)).body.message).toBe('The file has a quoted value that is never closed.');
  });

  it('is only available to signed-in sponsors', async () => {
    await request(app).post('/api/sponsor/users/bulk').send({ csv: HEADER }).expect(401);
    expect((await upload(`${HEADER}\na@example.com,A,B,driver,a-pass-123`, { as: users.driver })).status).toBe(403);
    expect(calls('INSERT')).toHaveLength(0);
  });
});
