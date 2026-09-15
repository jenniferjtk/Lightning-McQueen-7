require('dotenv').config();
const { getPool } = require('./db');

async function main() {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    console.log('Connected! Result:', rows[0].result);
    const [users] = await pool.query('SELECT COUNT(*) AS userCount FROM users');
    console.log('Users table has', users[0].userCount, 'rows');
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

main();