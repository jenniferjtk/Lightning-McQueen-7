const bcrypt = require('bcryptjs');
const { getPool } = require('../db');

module.exports.handler = async (event) => {
  const { email, password, role, firstName, lastName } = JSON.parse(event.body);

  if (!email || !password || !role) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10); // 10 = salt rounds

    const pool = getPool();
    await pool.query(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, role, firstName, lastName]
    );

    return { statusCode: 201, body: JSON.stringify({ message: 'User created' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};