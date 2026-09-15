import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import session from 'express-session';
import mysql from 'mysql2/promise';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
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
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

const publicUser = (user) => ({
  id: user.user_id,
  email: user.email,
  role: user.role,
  firstName: user.first_name,
  lastName: user.last_name,
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });

  try {
    const [rows] = await pool.execute(
      'SELECT user_id, email, role, first_name, last_name FROM users WHERE user_id = ?',
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

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

// Placeholder shape — replace with a real database query keyed off the
// authenticated driver's ID. Field names must stay the same since the
// frontend reads this exact shape.
const driver = {
  id: '',
  name: '',
  dateJoined: '',
  sponsorName: '',
  points: 0,
  recentPurchases: [],
};

app.get('/api/driver', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated.' });
  res.json(driver);
});

app.listen(PORT, () => {
  console.log(`Driver dashboard API running on http://localhost:${PORT}`);
});