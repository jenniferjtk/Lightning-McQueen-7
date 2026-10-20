import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import mysql from 'mysql2/promise';
import { CatalogProviderError, fetchProduct, fetchProducts } from './fakeStore.js';

dotenv.config();

const app = express();
// Set by the Lambda runtime; absent when running locally with `npm run server`.
const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const PORT = process.env.PORT || 4000;
// API Gateway terminates TLS, so trust its X-Forwarded-Proto; without this
// express-session refuses to send the Secure cookie.
if (isLambda) app.set('trust proxy', 1);
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lightning_mcqueen',
  waitForConnections: true,
  connectionLimit: 10,
});

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
// Lambda instances share no memory, so sessions must live in MySQL there
// (table from backend/db/migrations/004_sessions_table.sql). Local runs keep
// the default in-memory store.
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = isLambda
  ? new MySQLStore({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    createDatabaseTable: false,
  })
  : undefined;

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'development-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isLambda || process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

const publicUser = (user) => ({
  id: user.user_id,
  email: user.email,
  role: user.role,
  firstName: user.first_name,
  lastName: user.last_name,
  sponsorId: user.sponsor_id ?? null,
});

const adminDriver = (user) => ({
  id: user.user_id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  createdAt: user.created_at,
});

const validEmail = (email) => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const requireRuleManager = async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    const [rows] = await pool.execute('SELECT role FROM users WHERE user_id = ?', [req.session.userId]);
    if (!rows[0]) return res.status(401).json({ message: 'Session expired.' });
    if (!['admin', 'sponsor'].includes(rows[0].role)) {
      return res.status(403).json({ message: 'Sponsor access is required to manage point rules.' });
    }
    return next();
  } catch (error) {
    console.error('Point rule authorization failed:', error.message);
    return res.status(500).json({ message: 'Unable to authorize this request.' });
  }
};

const validateSponsorRule = (body) => {
  const sponsorId = Number(body.sponsorId);
  const ptValue = Number(body.ptValue);
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const frequency = body.frequency;

  if (!Number.isSafeInteger(sponsorId) || sponsorId < 1 || sponsorId > 2147483647) {
    return { error: 'Choose a valid sponsor organization.' };
  }
  if (!Number.isSafeInteger(ptValue) || ptValue < -2147483648 || ptValue > 2147483647) {
    return { error: 'Points must be a whole number.' };
  }
  if (!description || description.length > 45) {
    return { error: 'Description is required and must be 45 characters or fewer.' };
  }
  if (!['one-time', 'recurring'].includes(frequency)) {
    return { error: 'Frequency must be one-time or recurring.' };
  }
  return { sponsorId, ptValue, description, frequency };
};

const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    const [rows] = await pool.execute('SELECT role FROM users WHERE user_id = ?', [req.session.userId]);
    if (rows[0]?.role !== 'admin') return res.status(403).json({ message: 'Administrator access is required.' });
    return next();
  } catch (error) {
    console.error('Admin authorization failed:', error.message);
    return res.status(500).json({ message: 'Unable to authorize this request.' });
  }
};

const requireLinkedSponsor = async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    const [rows] = await pool.execute(
      `SELECT s.sponsor_id, s.name
       FROM users u
       JOIN sponsors s ON s.sponsor_user_id = u.user_id
       WHERE u.user_id = ? AND u.role = 'sponsor'`,
      [req.session.userId],
    );
    if (!rows[0]) return res.status(403).json({ message: 'A linked sponsor organization is required.' });
    req.sponsor = rows[0];
    return next();
  } catch (error) {
    console.error('Sponsor authorization failed:', error.message);
    return res.status(500).json({ message: 'Unable to authorize this request.' });
  }
};

const parsePointConversionRate = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d{1,6}(?:\.\d{1,4})?$/.test(text)) return null;
  const rate = Number(text);
  return Number.isFinite(rate) && rate >= 0.0001 && rate <= 999999.9999 ? rate : null;
};

app.get('/api/about', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT sprint_num AS sprintNumber,
              DATE_FORMAT(release_date, '%m/%d/%Y') AS releaseDate
       FROM about_page
       ORDER BY sprint_num DESC, release_date DESC
       LIMIT 1`,
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'No sprint release information is available.' });
    }
    return res.json(rows[0]);
  } catch (error) {
    console.error('About page lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load release details from the database.' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });

  try {
    const [rows] = await pool.execute(
      'SELECT user_id, email, role, first_name, last_name, sponsor_id FROM users WHERE user_id = ?',
      [req.session.userId],
    );
    if (!rows[0]) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: 'Session expired.' });
    }
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    console.error('Auth lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to check your session.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, created_at)
       VALUES (?, ?, 'driver', ?, ?, NOW())`,
      [email.trim().toLowerCase(), passwordHash, firstName.trim(), lastName.trim()],
    );
    req.session.userId = result.insertId;
    return res.status(201).json({
      user: {
        id: result.insertId,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: 'driver',
        sponsorId: null,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with that email already exists.' });
    console.error('Registration failed:', error.message);
    return res.status(500).json({ message: 'Unable to create your account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    req.session.userId = user.user_id;
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ message: 'Unable to sign you in.' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Please sign in again to change your password.' });

  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ message: 'Enter your current password and a new password.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  try {
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE user_id = ?', [req.session.userId]);
    if (!rows[0]) return res.status(401).json({ message: 'Your account could not be found. Please sign in again.' });
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ? WHERE user_id = ?', [passwordHash, req.session.userId]);
    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Password change failed:', error.message);
    return res.status(500).json({ message: 'Unable to update your password right now.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

app.get('/api/admin/drivers', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, email, first_name, last_name, created_at
       FROM users WHERE role = 'driver' ORDER BY created_at DESC, user_id DESC`,
    );
    return res.json({ drivers: rows.map(adminDriver) });
  } catch (error) {
    console.error('Driver list failed:', error.message);
    return res.status(500).json({ message: 'Unable to load driver accounts.' });
  }
});

app.get('/api/admin/sponsor-links', requireAdmin, async (req, res) => {
  try {
    const [sponsors] = await pool.execute(
      `SELECT s.sponsor_id, s.name, s.sponsor_user_id,
              u.email AS sponsor_user_email
       FROM sponsors s
       LEFT JOIN users u ON u.user_id = s.sponsor_user_id
       ORDER BY s.name`,
    );
    const [sponsorUsers] = await pool.execute(
      `SELECT user_id, email, first_name, last_name
       FROM users WHERE role = 'sponsor'
       ORDER BY last_name, first_name, user_id`,
    );
    return res.json({ sponsors, sponsorUsers });
  } catch (error) {
    console.error('Sponsor account list failed:', error.message);
    return res.status(500).json({ message: 'Unable to load sponsor account links.' });
  }
});

app.put('/api/admin/sponsor-links/:sponsorId', requireAdmin, async (req, res) => {
  const sponsorId = Number(req.params.sponsorId);
  const sponsorUserId = req.body?.sponsorUserId === null || req.body?.sponsorUserId === ''
    ? null
    : Number(req.body?.sponsorUserId);
  if (!Number.isSafeInteger(sponsorId) || sponsorId < 1) {
    return res.status(400).json({ message: 'Invalid sponsor organization.' });
  }
  if (sponsorUserId !== null && (!Number.isSafeInteger(sponsorUserId) || sponsorUserId < 1)) {
    return res.status(400).json({ message: 'Choose a valid sponsor account.' });
  }
  try {
    const [sponsors] = await pool.execute('SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [sponsorId]);
    if (!sponsors[0]) return res.status(404).json({ message: 'Sponsor organization not found.' });
    if (sponsorUserId !== null) {
      const [users] = await pool.execute("SELECT user_id FROM users WHERE user_id = ? AND role = 'sponsor'", [sponsorUserId]);
      if (!users[0]) return res.status(400).json({ message: 'Choose a sponsor account.' });
    }
    await pool.execute('UPDATE sponsors SET sponsor_user_id = ? WHERE sponsor_id = ?', [sponsorUserId, sponsorId]);
    return res.json({ message: 'Sponsor account link saved.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That sponsor account is already linked to another organization.' });
    }
    console.error('Sponsor account link update failed:', error.message);
    return res.status(500).json({ message: 'Unable to save the sponsor account link.' });
  }
});

app.get('/api/sponsor/conversion', requireLinkedSponsor, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT name, point_conversion_rate FROM sponsors WHERE sponsor_id = ?',
      [req.sponsor.sponsor_id],
    );
    return res.json({ sponsorName: rows[0].name, pointConversionRate: rows[0].point_conversion_rate });
  } catch (error) {
    console.error('Sponsor conversion lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load the point value.' });
  }
});

app.put('/api/sponsor/conversion', requireLinkedSponsor, async (req, res) => {
  const pointConversionRate = parsePointConversionRate(req.body?.pointConversionRate);
  if (pointConversionRate === null) {
    return res.status(400).json({ message: 'Enter a dollar value from 0.0001 to 999999.9999 per point.' });
  }
  try {
    await pool.execute(
      'UPDATE sponsors SET point_conversion_rate = ? WHERE sponsor_id = ?',
      [pointConversionRate, req.sponsor.sponsor_id],
    );
    return res.json({ sponsorName: req.sponsor.name, pointConversionRate });
  } catch (error) {
    console.error('Sponsor conversion update failed:', error.message);
    return res.status(500).json({ message: 'Unable to save the point value.' });
  }
});

app.get('/api/driver/conversion', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    const [rows] = await pool.execute(
      `SELECT s.name AS sponsor_name, s.point_conversion_rate
       FROM users u
       JOIN driver_applications a ON a.driver_user_id = u.user_id AND a.status = 'approved'
       JOIN sponsors s ON s.sponsor_id = a.sponsor_id
       WHERE u.user_id = ? AND u.role = 'driver'
       ORDER BY COALESCE(a.decided_at, a.submitted_at) DESC, a.application_id DESC
       LIMIT 1`,
      [req.session.userId],
    );
    return res.json({
      sponsorName: rows[0]?.sponsor_name || null,
      pointConversionRate: rows[0]?.point_conversion_rate ?? null,
    });
  } catch (error) {
    console.error('Driver conversion lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load the point value.' });
  }
});

app.get('/api/admin/sponsors', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, email, first_name, last_name, created_at
       FROM users WHERE role = 'sponsor' ORDER BY created_at DESC, user_id DESC`,
    );
    return res.json({ sponsors: rows.map(adminDriver) });
  } catch (error) {
    console.error('Sponsor user list failed:', error.message);
    return res.status(500).json({ message: 'Unable to load sponsor accounts.' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { email, password, firstName, lastName, role } = req.body || {};
  if (!['driver', 'admin', 'sponsor'].includes(role)) {
    return res.status(400).json({ message: 'Choose a driver, admin, or sponsor role.' });
  }
  if (!validEmail(email) || typeof password !== 'string' || !password ||
      typeof firstName !== 'string' || !firstName.trim() ||
      typeof lastName !== 'string' || !lastName.trim()) {
    return res.status(400).json({ message: 'A first name, last name, valid email, and password are required.' });
  }
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be 72 bytes or fewer.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [email.trim().toLowerCase(), passwordHash, role, firstName.trim(), lastName.trim()],
    );
    const [rows] = await pool.execute(
      'SELECT user_id, email, role, first_name, last_name, created_at FROM users WHERE user_id = ?',
      [result.insertId],
    );
    return res.status(201).json({ user: { ...adminDriver(rows[0]), role: rows[0].role } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with that email already exists.' });
    console.error('User creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create the user account.' });
  }
});

app.post('/api/admin/drivers', requireAdmin, async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  if (!validEmail(email) || !password || !firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ message: 'A first name, last name, valid email, and password are required.' });
  }
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, created_at)
       VALUES (?, ?, 'driver', ?, ?, NOW())`,
      [email.trim().toLowerCase(), passwordHash, firstName.trim(), lastName.trim()],
    );
    const [rows] = await pool.execute('SELECT user_id, email, first_name, last_name, created_at FROM users WHERE user_id = ?', [result.insertId]);
    return res.status(201).json({ driver: adminDriver(rows[0]) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with that email already exists.' });
    console.error('Driver creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create the driver account.' });
  }
});

app.put('/api/admin/drivers/:driverId', requireAdmin, async (req, res) => {
  const driverId = Number(req.params.driverId);
  const { email, firstName, lastName } = req.body;
  if (!Number.isInteger(driverId) || driverId < 1 || !validEmail(email) || !firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ message: 'A first name, last name, and valid email are required.' });
  }
  try {
    const [result] = await pool.execute(
      `UPDATE users SET email = ?, first_name = ?, last_name = ?
       WHERE user_id = ? AND role = 'driver'`,
      [email.trim().toLowerCase(), firstName.trim(), lastName.trim(), driverId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Driver account not found.' });
    const [rows] = await pool.execute('SELECT user_id, email, first_name, last_name, created_at FROM users WHERE user_id = ?', [driverId]);
    return res.json({ driver: adminDriver(rows[0]) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with that email already exists.' });
    console.error('Driver update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update the driver account.' });
  }
});

app.put('/api/admin/drivers/:driverId/password', requireAdmin, async (req, res) => {
  const driverId = Number(req.params.driverId);
  const { password } = req.body;
  if (!Number.isSafeInteger(driverId) || driverId < 1) {
    return res.status(400).json({ message: 'Invalid driver account.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be 72 bytes or fewer.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      "UPDATE users SET password_hash = ? WHERE user_id = ? AND role = 'driver'",
      [passwordHash, driverId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Driver account not found.' });
    return res.json({ message: 'Driver password reset.' });
  } catch (error) {
    console.error('Driver password reset failed:', error.message);
    return res.status(500).json({ message: 'Unable to reset the driver password.' });
  }
});

app.delete('/api/admin/drivers/:driverId', requireAdmin, async (req, res) => {
  const driverId = Number(req.params.driverId);
  if (!Number.isInteger(driverId) || driverId < 1) return res.status(400).json({ message: 'Invalid driver account.' });
  try {
    const [result] = await pool.execute("DELETE FROM users WHERE user_id = ? AND role = 'driver'", [driverId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Driver account not found.' });
    return res.status(204).end();
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'This driver has related records and cannot be deleted.' });
    }
    console.error('Driver deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to delete the driver account.' });
  }
});

app.put('/api/admin/sponsors/:sponsorId', requireAdmin, async (req, res) => {
  const sponsorId = Number(req.params.sponsorId);
  const { email, firstName, lastName } = req.body || {};
  if (!Number.isSafeInteger(sponsorId) || sponsorId < 1 || !validEmail(email) || typeof firstName !== 'string' || !firstName.trim() || typeof lastName !== 'string' || !lastName.trim()) {
    return res.status(400).json({ message: 'A first name, last name, and valid email are required.' });
  }
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const [result] = await pool.execute(
      `UPDATE users SET email = ?, first_name = ?, last_name = ?
       WHERE user_id = ? AND role = 'sponsor'`,
      [normalizedEmail, normalizedFirstName, normalizedLastName, sponsorId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Sponsor account not found.' });
    return res.json({
      sponsor: {
        id: sponsorId,
        email: normalizedEmail,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with that email already exists.' });
    console.error('Sponsor update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update the sponsor account.' });
  }
});

app.put('/api/admin/sponsors/:sponsorId/password', requireAdmin, async (req, res) => {
  const sponsorId = Number(req.params.sponsorId);
  const { password } = req.body || {};
  if (!Number.isSafeInteger(sponsorId) || sponsorId < 1) {
    return res.status(400).json({ message: 'Invalid sponsor account.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be 72 bytes or fewer.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      "UPDATE users SET password_hash = ? WHERE user_id = ? AND role = 'sponsor'",
      [passwordHash, sponsorId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Sponsor account not found.' });
    return res.json({ message: 'Sponsor password reset.' });
  } catch (error) {
    console.error('Sponsor password reset failed:', error.message);
    return res.status(500).json({ message: 'Unable to reset the sponsor password.' });
  }
});

app.delete('/api/admin/sponsors/:sponsorId', requireAdmin, async (req, res) => {
  const sponsorId = Number(req.params.sponsorId);
  if (!Number.isSafeInteger(sponsorId) || sponsorId < 1) {
    return res.status(400).json({ message: 'Invalid sponsor account.' });
  }
  try {
    const [result] = await pool.execute(
      "DELETE FROM users WHERE user_id = ? AND role = 'sponsor'",
      [sponsorId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Sponsor account not found.' });
    return res.status(204).end();
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'This sponsor has related records and cannot be deleted.' });
    }
    console.error('Sponsor deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to delete the sponsor account.' });
  }
});

app.get('/api/sponsor/drivers', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    const [sponsorRows] = await pool.execute(
      "SELECT role, sponsor_id FROM users WHERE user_id = ?",
      [req.session.userId],
    );
    const sponsorUser = sponsorRows[0];
    if (!sponsorUser) return res.status(401).json({ message: 'Session expired.' });
    if (sponsorUser.role !== 'sponsor') return res.status(403).json({ message: 'Sponsor access is required.' });
    if (!sponsorUser.sponsor_id) return res.json({ sponsorLinked: false, drivers: [] });

    const [drivers] = await pool.execute(
      `SELECT u.user_id AS id, u.first_name AS firstName, u.last_name AS lastName,
              u.email, u.created_at AS createdAt, COALESCE(points.total, 0) AS points,
              a.application_id AS applicationId, a.status, a.submitted_at AS submittedAt,
              a.decided_at AS decidedAt, s.name AS sponsorName
       FROM driver_applications a
       JOIN users u ON u.user_id = a.driver_user_id
       JOIN sponsors s ON s.sponsor_id = a.sponsor_id
       LEFT JOIN (
         SELECT l.affected_user_id, SUM(r.pt_value) AS total
         FROM point_audit_log l
         JOIN sponsor_rules r ON r.rule_id = l.sponsor_rule_id
         GROUP BY l.affected_user_id
       ) points ON points.affected_user_id = u.user_id
       WHERE a.sponsor_id = ? AND a.status = 'approved' AND u.role = 'driver'
       ORDER BY u.last_name, u.first_name, u.user_id`,
      [sponsorUser.sponsor_id],
    );
    return res.json({
      sponsorLinked: true,
      drivers: drivers.map((driver) => ({ ...driver, points: Number(driver.points) })),
    });
  } catch (error) {
    console.error('Sponsor driver list failed:', error.message);
    return res.status(500).json({ message: 'Unable to load sponsor drivers.' });
  }
});

app.get('/api/sponsor-rules', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    const [rows] = await pool.execute(
      'SELECT rule_id, sponsor_id, pt_value, description, frequency FROM sponsor_rules ORDER BY sponsor_id, rule_id',
    );
    return res.json({ rules: rows });
  } catch (error) {
    console.error('Point rule list failed:', error.message);
    return res.status(500).json({ message: 'Unable to load point rules.' });
  }
});

app.post('/api/sponsor-rules', requireRuleManager, async (req, res) => {
  const rule = validateSponsorRule(req.body || {});
  if (rule.error) return res.status(400).json({ message: rule.error });
  try {
    const [sponsors] = await pool.execute('SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [rule.sponsorId]);
    if (!sponsors[0]) return res.status(400).json({ message: 'Sponsor organization not found.' });
    const [result] = await pool.execute(
      'INSERT INTO sponsor_rules (sponsor_id, pt_value, description, frequency) VALUES (?, ?, ?, ?)',
      [rule.sponsorId, rule.ptValue, rule.description, rule.frequency],
    );
    return res.status(201).json({
      rule: {
        rule_id: result.insertId,
        sponsor_id: rule.sponsorId,
        pt_value: rule.ptValue,
        description: rule.description,
        frequency: rule.frequency,
      },
    });
  } catch (error) {
    console.error('Point rule creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create the point rule.' });
  }
});

app.put('/api/sponsor-rules/:ruleId', requireRuleManager, async (req, res) => {
  const ruleId = Number(req.params.ruleId);
  const rule = validateSponsorRule(req.body || {});
  if (!Number.isSafeInteger(ruleId) || ruleId < 1) return res.status(400).json({ message: 'Invalid point rule.' });
  if (rule.error) return res.status(400).json({ message: rule.error });
  try {
    const [sponsors] = await pool.execute('SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [rule.sponsorId]);
    if (!sponsors[0]) return res.status(400).json({ message: 'Sponsor organization not found.' });
    const [result] = await pool.execute(
      'UPDATE sponsor_rules SET sponsor_id = ?, pt_value = ?, description = ?, frequency = ? WHERE rule_id = ?',
      [rule.sponsorId, rule.ptValue, rule.description, rule.frequency, ruleId],
    );
    if (!result.affectedRows) {
      const [existing] = await pool.execute('SELECT rule_id FROM sponsor_rules WHERE rule_id = ?', [ruleId]);
      if (!existing[0]) return res.status(404).json({ message: 'Point rule not found.' });
    }
    return res.json({
      rule: {
        rule_id: ruleId,
        sponsor_id: rule.sponsorId,
        pt_value: rule.ptValue,
        description: rule.description,
        frequency: rule.frequency,
      },
    });
  } catch (error) {
    console.error('Point rule update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update the point rule.' });
  }
});

app.delete('/api/sponsor-rules/:ruleId', requireRuleManager, async (req, res) => {
  const ruleId = Number(req.params.ruleId);
  if (!Number.isSafeInteger(ruleId) || ruleId < 1) return res.status(400).json({ message: 'Invalid point rule.' });
  try {
    const [result] = await pool.execute('DELETE FROM sponsor_rules WHERE rule_id = ?', [ruleId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Point rule not found.' });
    return res.status(204).end();
  } catch (error) {
    console.error('Point rule deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to delete the point rule.' });
  }
});

// Loads the signed-in user onto req.currentUser and rejects anyone whose role
// isn't listed. Application routes take the driver/sponsor identity from here,
// never from the request body or query string.
const requireRole = (...roles) => async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  try {
    const [rows] = await pool.execute('SELECT user_id, role, sponsor_id FROM users WHERE user_id = ?', [req.session.userId]);
    if (!rows[0]) return res.status(401).json({ message: 'Session expired.' });
    if (!roles.includes(rows[0].role)) return res.status(403).json({ message: 'You do not have access to this action.' });
    if (rows[0].role === 'sponsor' && !rows[0].sponsor_id) {
      return res.status(403).json({ message: 'Your account is not linked to a sponsor organization.' });
    }
    req.currentUser = rows[0];
    return next();
  } catch (error) {
    console.error('Role authorization failed:', error.message);
    return res.status(500).json({ message: 'Unable to authorize this request.' });
  }
};

const APPLICATION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'];

app.get('/api/sponsors', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT sponsor_id, name, description, point_conversion_rate FROM sponsors ORDER BY name',
    );
    return res.json(rows);
  } catch (error) {
    console.error('Sponsor lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load sponsors.' });
  }
});

// Drivers see their own applications; sponsors see their organization's,
// joined with each applying driver's profile.
app.get('/api/applications', requireRole('driver', 'sponsor'), async (req, res) => {
  const { status } = req.query;
  if (status && !APPLICATION_STATUSES.includes(status)) {
    return res.status(400).json({ message: `Status must be one of: ${APPLICATION_STATUSES.join(', ')}.` });
  }

  try {
    if (req.currentUser.role === 'driver') {
      const [rows] = await pool.execute(
        `SELECT a.application_id, a.sponsor_id, s.name AS sponsor_name, a.status, a.submitted_at
         FROM driver_applications a
         JOIN sponsors s ON s.sponsor_id = a.sponsor_id
         WHERE a.driver_user_id = ?${status ? ' AND a.status = ?' : ''}
         ORDER BY a.submitted_at DESC`,
        status ? [req.currentUser.user_id, status] : [req.currentUser.user_id],
      );
      return res.json(rows);
    }

    const [rows] = await pool.execute(
      `SELECT a.application_id, a.status, a.submitted_at, a.decided_at,
              u.user_id AS driver_user_id, u.first_name, u.last_name, u.email
       FROM driver_applications a
       JOIN users u ON u.user_id = a.driver_user_id
       WHERE a.sponsor_id = ?${status ? ' AND a.status = ?' : ''}
       ORDER BY a.submitted_at DESC`,
      status ? [req.currentUser.sponsor_id, status] : [req.currentUser.sponsor_id],
    );
    return res.json(rows);
  } catch (error) {
    console.error('Application lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load applications.' });
  }
});

app.post('/api/applications', requireRole('driver'), async (req, res) => {
  const sponsorId = Number(req.body?.sponsorId);
  if (!Number.isSafeInteger(sponsorId) || sponsorId < 1) {
    return res.status(400).json({ message: 'Choose a valid sponsor.' });
  }

  try {
    const [sponsors] = await pool.execute('SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [sponsorId]);
    if (!sponsors[0]) return res.status(400).json({ message: 'No sponsor found for that sponsor.' });

    const [existing] = await pool.execute(
      "SELECT application_id FROM driver_applications WHERE driver_user_id = ? AND sponsor_id = ? AND status IN ('pending', 'approved')",
      [req.currentUser.user_id, sponsorId],
    );
    if (existing[0]) {
      return res.status(409).json({ message: 'You already have a pending or approved application with this sponsor.' });
    }

    const [result] = await pool.execute(
      "INSERT INTO driver_applications (driver_user_id, sponsor_id, status) VALUES (?, ?, 'pending')",
      [req.currentUser.user_id, sponsorId],
    );
    return res.status(201).json({ application_id: result.insertId, sponsor_id: sponsorId, status: 'pending' });
  } catch (error) {
    console.error('Application create failed:', error.message);
    return res.status(500).json({ message: 'Unable to submit your application.' });
  }
});

app.patch('/api/applications/:applicationId/withdraw', requireRole('driver'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT status FROM driver_applications WHERE application_id = ? AND driver_user_id = ?',
      [req.params.applicationId, req.currentUser.user_id],
    );
    if (!rows[0]) return res.status(404).json({ message: 'No matching application was found.' });
    if (rows[0].status !== 'pending') {
      return res.status(409).json({ message: `Cannot withdraw an application with status "${rows[0].status}".` });
    }

    // status = 'pending' in the WHERE guards against a decision landing
    // between the SELECT above and this UPDATE.
    const [result] = await pool.execute(
      "UPDATE driver_applications SET status = 'withdrawn' WHERE application_id = ? AND status = 'pending'",
      [req.params.applicationId],
    );
    if (result.affectedRows === 0) return res.status(409).json({ message: 'Application is no longer pending.' });
    return res.json({ application_id: Number(req.params.applicationId), status: 'withdrawn' });
  } catch (error) {
    console.error('Application withdraw failed:', error.message);
    return res.status(500).json({ message: 'Unable to withdraw your application.' });
  }
});

app.patch('/api/applications/:applicationId/decide', requireRole('sponsor'), async (req, res) => {
  const { decision } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'Decision must be "approved" or "rejected".' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT sponsor_id, status FROM driver_applications WHERE application_id = ?',
      [req.params.applicationId],
    );
    if (!rows[0]) return res.status(404).json({ message: 'No application found with that id.' });
    if (Number(rows[0].sponsor_id) !== Number(req.currentUser.sponsor_id)) {
      return res.status(403).json({ message: 'This application belongs to a different sponsor.' });
    }
    if (rows[0].status !== 'pending') {
      return res.status(409).json({ message: `Cannot decide an application with status "${rows[0].status}".` });
    }

    // status = 'pending' in the WHERE guards against a withdraw or second
    // decision landing between the SELECT above and this UPDATE.
    const [result] = await pool.execute(
      "UPDATE driver_applications SET status = ?, decided_at = NOW() WHERE application_id = ? AND status = 'pending'",
      [decision, req.params.applicationId],
    );
    if (result.affectedRows === 0) return res.status(409).json({ message: 'Application is no longer pending.' });
    return res.json({ application_id: Number(req.params.applicationId), status: decision });
  } catch (error) {
    console.error('Application decision failed:', error.message);
    return res.status(500).json({ message: 'Unable to save your decision.' });
  }
});

// Point history charts for the signed-in driver. Each point_audit_log row
// records one rule being applied to a driver; the rule's pt_value is the
// change (negative = points lost) and its description is the reason. The
// driver always comes from the session, never from the query string.
const pointTotalsByReason = (sign) => async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.description AS reason, SUM(r.pt_value) AS total
       FROM point_audit_log l
       JOIN sponsor_rules r ON r.rule_id = l.sponsor_rule_id
       WHERE l.affected_user_id = ? AND r.pt_value ${sign === 'gains' ? '> 0' : '< 0'}
       GROUP BY r.description`,
      [req.currentUser.user_id],
    );
    // Losses are charted as positive sizes, largest first in both cases.
    const totals = rows
      .map((row) => ({ reason: row.reason || 'Unspecified', total: Math.abs(Number(row.total)) }))
      .sort((a, b) => b.total - a.total);
    return res.json(totals);
  } catch (error) {
    console.error(`Point ${sign} lookup failed:`, error.message);
    return res.status(500).json({ message: 'Unable to load your point history.' });
  }
};

app.get('/api/points/gains', requireRole('driver'), pointTotalsByReason('gains'));
app.get('/api/points/losses', requireRole('driver'), pointTotalsByReason('losses'));

app.get('/api/points/trend', requireRole('driver'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DATE_FORMAT(l.timestamp, '%Y-%m-%d') AS date, SUM(r.pt_value) AS change_amount
       FROM point_audit_log l
       JOIN sponsor_rules r ON r.rule_id = l.sponsor_rule_id
       WHERE l.affected_user_id = ?
       GROUP BY date
       ORDER BY date`,
      [req.currentUser.user_id],
    );
    let runningTotal = 0;
    return res.json(rows.map((row) => {
      runningTotal += Number(row.change_amount);
      return { date: row.date, cumulative_total: runningTotal };
    }));
  } catch (error) {
    console.error('Point trend lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load your point history.' });
  }
});

// A sponsor applies one of its own point rules to a driver in its program,
// which writes the point_audit_log row the driver's point charts read. The
// sponsor comes from the session; the rule supplies the amount and reason so
// neither is trusted from the client.
app.post('/api/points/apply', requireRole('sponsor'), async (req, res) => {
  const driverUserId = Number(req.body?.driverUserId);
  const ruleId = Number(req.body?.ruleId);
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
  if (!Number.isSafeInteger(driverUserId) || driverUserId < 1) {
    return res.status(400).json({ message: 'Choose a valid driver.' });
  }
  if (!Number.isSafeInteger(ruleId) || ruleId < 1) {
    return res.status(400).json({ message: 'Choose a point rule.' });
  }
  if (comment.length > 45) {
    return res.status(400).json({ message: 'Comment must be 45 characters or fewer.' });
  }

  try {
    const [rules] = await pool.execute(
      'SELECT rule_id, sponsor_id, pt_value, description FROM sponsor_rules WHERE rule_id = ?',
      [ruleId],
    );
    if (!rules[0]) return res.status(404).json({ message: 'No point rule found with that id.' });
    if (Number(rules[0].sponsor_id) !== Number(req.currentUser.sponsor_id)) {
      return res.status(403).json({ message: 'This point rule belongs to a different sponsor.' });
    }

    const [approved] = await pool.execute(
      "SELECT application_id FROM driver_applications WHERE driver_user_id = ? AND sponsor_id = ? AND status = 'approved'",
      [driverUserId, req.currentUser.sponsor_id],
    );
    if (!approved[0]) return res.status(403).json({ message: 'This driver is not in your sponsor program.' });

    const [result] = await pool.execute(
      `INSERT INTO point_audit_log (actor_id, sponsor_rule_id, affected_user_id, timestamp, comment)
       VALUES (?, ?, ?, CURDATE(), ?)`,
      [req.currentUser.user_id, ruleId, driverUserId, comment || null],
    );
    return res.status(201).json({
      log_id: result.insertId,
      driver_user_id: driverUserId,
      rule_id: ruleId,
      reason: rules[0].description,
      change_amount: Number(rules[0].pt_value),
    });
  } catch (error) {
    console.error('Point rule apply failed:', error.message);
    return res.status(500).json({ message: 'Unable to apply the point rule.' });
  }
});

// Dashboard data for the signed-in user. The sponsor is whichever sponsor(s)
// approved this driver's application. The balance and recent updates come
// from point_audit_log; purchases aren't stored yet, so they stay empty.
app.get('/api/driver', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });

  try {
    const [users] = await pool.execute(
      'SELECT user_id, first_name, last_name, created_at FROM users WHERE user_id = ?',
      [req.session.userId],
    );
    if (!users[0]) return res.status(401).json({ message: 'Session expired.' });

    const [sponsors] = await pool.execute(
      `SELECT s.name
       FROM driver_applications a
       JOIN sponsors s ON s.sponsor_id = a.sponsor_id
       WHERE a.driver_user_id = ? AND a.status = 'approved'
       ORDER BY a.decided_at DESC`,
      [req.session.userId],
    );

    const [[balance]] = await pool.execute(
      `SELECT COALESCE(SUM(r.pt_value), 0) AS points
       FROM point_audit_log l
       JOIN sponsor_rules r ON r.rule_id = l.sponsor_rule_id
       WHERE l.affected_user_id = ?`,
      [req.session.userId],
    );
    const [recent] = await pool.execute(
      `SELECT l.log_id, r.description, r.pt_value, DATE_FORMAT(l.timestamp, '%b %e, %Y') AS date
       FROM point_audit_log l
       JOIN sponsor_rules r ON r.rule_id = l.sponsor_rule_id
       WHERE l.affected_user_id = ?
       ORDER BY l.timestamp DESC, l.log_id DESC
       LIMIT 5`,
      [req.session.userId],
    );

    return res.json({
      id: users[0].user_id,
      name: `${users[0].first_name} ${users[0].last_name}`.trim(),
      dateJoined: users[0].created_at,
      sponsorName: sponsors.map((sponsor) => sponsor.name).join(', '),
      points: Number(balance.points),
      balanceNotifications: recent.map((entry) => ({
        id: entry.log_id,
        label: entry.description || 'Point adjustment',
        date: entry.date,
        amount: Number(entry.pt_value),
      })),
      recentPurchases: [],
    });
  } catch (error) {
    console.error('Driver dashboard lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load your dashboard.' });
  }
});

// Product catalog. Products come from the Fake Store API (fakeStore.js) into
// cached_products; each sponsor picks its own subset into sponsor_catalog
// (backend/db/migrations/005_catalog_tables.sql). Browsing reads the cache and
// refetches the provider's list once the cache is older than the TTL; the
// one-product live check re-fetches before checkout.
const CATALOG_CACHE_TTL_SECONDS = Number(process.env.CATALOG_CACHE_TTL_MINUTES || 15) * 60;
const CATALOG_UNAVAILABLE = 'The product catalog is unavailable right now. Please try again in a few minutes.';

const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 1 && id <= 2147483647 ? id : null;
};

// Missing or blank means "no tag" (null); anything else must be a short string.
const parseCategoryTag = (value) => {
  if (value === undefined || value === null) return { categoryTag: null };
  if (typeof value !== 'string') return { error: 'Category tag must be text.' };
  const categoryTag = value.trim();
  if (categoryTag.length > 100) return { error: 'Category tag must be 100 characters or fewer.' };
  return { categoryTag: categoryTag || null };
};

const escapeLike = (text) => text.replace(/[\\%_]/g, (character) => `\\${character}`);

// point_conversion_rate is dollars per point. toFixed trims float noise so a
// $1.10 item at $0.10/pt is 11 points, not 12.
const pointCost = (price, pointConversionRate) => {
  const rate = Number(pointConversionRate);
  return rate > 0 ? Math.ceil(Number((Number(price) / rate).toFixed(6))) : null;
};

const catalogProduct = (row) => ({
  productId: row.product_id,
  title: row.title,
  price: Number(row.price),
  description: row.description,
  category: row.category,
  imageUrl: row.image_url,
});

const sponsorCatalogProduct = (row, pointConversionRate) => ({
  ...catalogProduct(row),
  categoryTag: row.category_tag ?? null,
  displayCategory: row.category_tag || row.category,
  pointCost: pointCost(row.price, pointConversionRate),
});

const upsertCachedProducts = async (products) => {
  if (!products.length) return;
  await pool.execute(
    `INSERT INTO cached_products (product_id, title, price, description, category, image_url, fetched_at)
     VALUES ${products.map(() => '(?, ?, ?, ?, ?, ?, NOW())').join(', ')}
     ON DUPLICATE KEY UPDATE title = VALUES(title), price = VALUES(price), description = VALUES(description),
       category = VALUES(category), image_url = VALUES(image_url), fetched_at = VALUES(fetched_at)`,
    products.flatMap((product) => [
      product.productId, product.title, product.price, product.description, product.category, product.imageUrl,
    ]),
  );
};

// Refetches the provider's product list when the last full refresh is older
// than the TTL. If the provider is down but an older copy exists, that copy is
// served and { stale: true } is returned; with nothing cached it throws.
const refreshCatalogCacheIfStale = async () => {
  const [[cache]] = await pool.execute(
    `SELECT COUNT(*) AS product_count, TIMESTAMPDIFF(SECOND, MAX(fetched_at), NOW()) AS age_seconds
     FROM cached_products`,
  );
  const cachedCount = Number(cache.product_count);
  if (cachedCount > 0 && Number(cache.age_seconds) < CATALOG_CACHE_TTL_SECONDS) return { stale: false };
  try {
    await upsertCachedProducts(await fetchProducts());
    return { stale: false };
  } catch (error) {
    if (!(error instanceof CatalogProviderError) || cachedCount === 0) throw error;
    console.error('Catalog refresh failed, serving cached products:', error.message);
    return { stale: true };
  }
};

const sendCatalogError = (res, error, context, message) => {
  console.error(`${context}:`, error.message);
  if (error instanceof CatalogProviderError) {
    return res.status(502).json({ message: CATALOG_UNAVAILABLE, code: 'CATALOG_UNAVAILABLE' });
  }
  return res.status(500).json({ message });
};

// Admins see any sponsor's catalog, sponsors only their own organization's,
// and drivers only the catalogs of sponsors that approved them.
const canViewSponsorCatalog = async (user, sponsorId) => {
  if (user.role === 'admin') return true;
  if (user.role === 'sponsor') return Number(user.sponsor_id) === sponsorId;
  const [approved] = await pool.execute(
    "SELECT application_id FROM driver_applications WHERE driver_user_id = ? AND sponsor_id = ? AND status = 'approved'",
    [user.user_id, sponsorId],
  );
  return Boolean(approved[0]);
};

const requireCatalogViewer = async (req, res, next) => {
  const sponsorId = parseId(req.params.sponsorId);
  if (!sponsorId) return res.status(400).json({ message: 'Invalid sponsor organization.' });
  try {
    if (!(await canViewSponsorCatalog(req.currentUser, sponsorId))) {
      return res.status(403).json({ message: 'You do not have access to this sponsor\'s catalog.' });
    }
    req.catalogSponsorId = sponsorId;
    return next();
  } catch (error) {
    console.error('Catalog authorization failed:', error.message);
    return res.status(500).json({ message: 'Unable to authorize this request.' });
  }
};

// Curation is limited to the sponsor's own organization. The sponsor in the URL
// is checked against the session, the same way application decisions are.
const requireOwnCatalog = (req, res, next) => {
  const sponsorId = parseId(req.params.sponsorId);
  if (!sponsorId) return res.status(400).json({ message: 'Invalid sponsor organization.' });
  if (sponsorId !== Number(req.currentUser.sponsor_id)) {
    return res.status(403).json({ message: 'This catalog belongs to a different sponsor.' });
  }
  req.catalogSponsorId = sponsorId;
  return next();
};

// The full provider product set, so a sponsor can choose what to offer. Each
// product says whether it's already in the signed-in sponsor's catalog.
app.get('/api/catalog/products', requireRole('sponsor', 'admin'), async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  if (search.length > 100 || category.length > 100) {
    return res.status(400).json({ message: 'Search and category must be 100 characters or fewer.' });
  }

  try {
    const { stale } = await refreshCatalogCacheIfStale();
    const filters = [];
    const params = [req.currentUser.sponsor_id ?? null];
    if (search) {
      filters.push('(p.title LIKE ? OR p.description LIKE ?)');
      params.push(`%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
    }
    if (category) {
      filters.push('p.category = ?');
      params.push(category);
    }
    const [rows] = await pool.execute(
      `SELECT p.product_id, p.title, p.price, p.description, p.category, p.image_url,
              sc.category_tag, sc.product_id IS NOT NULL AS in_catalog
       FROM cached_products p
       LEFT JOIN sponsor_catalog sc ON sc.product_id = p.product_id AND sc.sponsor_id = ?
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY p.category, p.product_id`,
      params,
    );
    const [categories] = await pool.execute('SELECT DISTINCT category FROM cached_products ORDER BY category');
    return res.json({
      products: rows.map((row) => ({
        ...catalogProduct(row),
        inCatalog: Boolean(Number(row.in_catalog)),
        categoryTag: row.category_tag ?? null,
      })),
      categories: categories.map((row) => row.category),
      stale,
    });
  } catch (error) {
    return sendCatalogError(res, error, 'Catalog product list failed', 'Unable to load catalog products.');
  }
});

// One sponsor's catalog. Drivers with more than one sponsor call this once per
// sponsor; the sponsor always comes from the URL and is checked against the
// session, so a driver never sees products their sponsor didn't select.
app.get('/api/sponsors/:sponsorId/catalog', requireRole('driver', 'sponsor', 'admin'), requireCatalogViewer, async (req, res) => {
  try {
    const [sponsors] = await pool.execute(
      'SELECT sponsor_id, name, point_conversion_rate FROM sponsors WHERE sponsor_id = ?',
      [req.catalogSponsorId],
    );
    if (!sponsors[0]) return res.status(404).json({ message: 'Sponsor organization not found.' });

    const { stale } = await refreshCatalogCacheIfStale();
    const [rows] = await pool.execute(
      `SELECT p.product_id, p.title, p.price, p.description, p.category, p.image_url, sc.category_tag
       FROM sponsor_catalog sc
       JOIN cached_products p ON p.product_id = sc.product_id
       WHERE sc.sponsor_id = ?
       ORDER BY COALESCE(sc.category_tag, p.category), p.title`,
      [req.catalogSponsorId],
    );
    return res.json({
      sponsorId: sponsors[0].sponsor_id,
      sponsorName: sponsors[0].name,
      pointConversionRate: Number(sponsors[0].point_conversion_rate),
      products: rows.map((row) => sponsorCatalogProduct(row, sponsors[0].point_conversion_rate)),
      stale,
    });
  } catch (error) {
    return sendCatalogError(res, error, 'Sponsor catalog lookup failed', 'Unable to load this catalog.');
  }
});

app.post('/api/sponsors/:sponsorId/catalog', requireRole('sponsor'), requireOwnCatalog, async (req, res) => {
  const productId = parseId(req.body?.productId);
  const { categoryTag, error: tagError } = parseCategoryTag(req.body?.categoryTag);
  if (!productId) return res.status(400).json({ message: 'Choose a valid product.' });
  if (tagError) return res.status(400).json({ message: tagError });

  try {
    await refreshCatalogCacheIfStale();
    const [products] = await pool.execute(
      `SELECT p.product_id, p.title, p.price, p.description, p.category, p.image_url
       FROM cached_products p WHERE p.product_id = ?`,
      [productId],
    );
    if (!products[0]) return res.status(404).json({ message: 'No product found with that id.' });

    await pool.execute(
      'INSERT INTO sponsor_catalog (sponsor_id, product_id, category_tag) VALUES (?, ?, ?)',
      [req.catalogSponsorId, productId, categoryTag],
    );
    return res.status(201).json({ product: { ...catalogProduct(products[0]), categoryTag } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That product is already in your catalog.' });
    return sendCatalogError(res, error, 'Catalog product add failed', 'Unable to add the product to your catalog.');
  }
});

app.patch('/api/sponsors/:sponsorId/catalog/:productId', requireRole('sponsor'), requireOwnCatalog, async (req, res) => {
  const productId = parseId(req.params.productId);
  const { categoryTag, error: tagError } = parseCategoryTag(req.body?.categoryTag);
  if (!productId) return res.status(400).json({ message: 'Choose a valid product.' });
  if (tagError) return res.status(400).json({ message: tagError });

  try {
    const [result] = await pool.execute(
      'UPDATE sponsor_catalog SET category_tag = ? WHERE sponsor_id = ? AND product_id = ?',
      [categoryTag, req.catalogSponsorId, productId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'That product is not in your catalog.' });
    return res.json({ productId, categoryTag });
  } catch (error) {
    console.error('Catalog tag update failed:', error.message);
    return res.status(500).json({ message: 'Unable to save the category tag.' });
  }
});

app.delete('/api/sponsors/:sponsorId/catalog/:productId', requireRole('sponsor'), requireOwnCatalog, async (req, res) => {
  const productId = parseId(req.params.productId);
  if (!productId) return res.status(400).json({ message: 'Choose a valid product.' });

  try {
    const [result] = await pool.execute(
      'DELETE FROM sponsor_catalog WHERE sponsor_id = ? AND product_id = ?',
      [req.catalogSponsorId, productId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'That product is not in your catalog.' });
    return res.status(204).end();
  } catch (error) {
    console.error('Catalog product removal failed:', error.message);
    return res.status(500).json({ message: 'Unable to remove the product from your catalog.' });
  }
});

// Re-fetches one catalog product from the provider instead of trusting the
// cache, for checkout to call right before it charges points. The cached row
// is updated, but not its fetched_at: that tracks the last full list refresh.
app.get('/api/sponsors/:sponsorId/catalog/:productId/live', requireRole('driver', 'sponsor', 'admin'), requireCatalogViewer, async (req, res) => {
  const productId = parseId(req.params.productId);
  if (!productId) return res.status(400).json({ message: 'Choose a valid product.' });

  try {
    const [rows] = await pool.execute(
      `SELECT p.product_id, p.title, p.price, p.description, p.category, p.image_url, sc.category_tag,
              s.point_conversion_rate
       FROM sponsor_catalog sc
       JOIN cached_products p ON p.product_id = sc.product_id
       JOIN sponsors s ON s.sponsor_id = sc.sponsor_id
       WHERE sc.sponsor_id = ? AND sc.product_id = ?`,
      [req.catalogSponsorId, productId],
    );
    if (!rows[0]) return res.status(404).json({ message: 'That product is not in this sponsor\'s catalog.' });

    const live = await fetchProduct(productId);
    if (!live) {
      return res.json({ available: false, cachedPrice: Number(rows[0].price), product: null, priceChanged: false });
    }
    await pool.execute(
      `UPDATE cached_products SET title = ?, price = ?, description = ?, category = ?, image_url = ?
       WHERE product_id = ?`,
      [live.title, live.price, live.description, live.category, live.imageUrl, productId],
    );
    const product = sponsorCatalogProduct({
      product_id: live.productId,
      title: live.title,
      price: live.price,
      description: live.description,
      category: live.category,
      image_url: live.imageUrl,
      category_tag: rows[0].category_tag,
    }, rows[0].point_conversion_rate);
    return res.json({
      available: true,
      cachedPrice: Number(rows[0].price),
      priceChanged: Number(rows[0].price) !== live.price,
      product,
    });
  } catch (error) {
    return sendCatalogError(res, error, 'Live product check failed', 'Unable to confirm this product right now.');
  }
});

// Vitest imports the app and drives it with Supertest, so it must not bind a port.
if (!isLambda && !process.env.VITEST) {
  app.listen(PORT, () => {
    console.log(`Driver dashboard API running on http://localhost:${PORT}`);
  });
}

export { app };
