const bcrypt = require('bcryptjs');
const { getPool } = require('../db');

module.exports.handler = async (event) => {
  const { email, password } = JSON.parse(event.body);
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ userId: user.user_id, role: user.role }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};