import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import mysql from 'mysql2/promise';

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

// Dashboard data for the signed-in user. The sponsor is whichever sponsor(s)
// approved this driver's application. Points and purchases aren't stored yet,
// so they stay empty until those tables exist.
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

    return res.json({
      id: users[0].user_id,
      name: `${users[0].first_name} ${users[0].last_name}`.trim(),
      dateJoined: users[0].created_at,
      sponsorName: sponsors.map((sponsor) => sponsor.name).join(', '),
      points: 0,
      recentPurchases: [],
    });
  } catch (error) {
    console.error('Driver dashboard lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to load your dashboard.' });
  }
});

// Vitest imports the app and drives it with Supertest, so it must not bind a port.
if (!isLambda && !process.env.VITEST) {
  app.listen(PORT, () => {
    console.log(`Driver dashboard API running on http://localhost:${PORT}`);
  });
}

export { app };
