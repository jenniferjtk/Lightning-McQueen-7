require('dotenv').config();
const { getPool } = require('./db');
const bcrypt = require('bcryptjs');

async function main() {
  const pool = getPool();
  const passwordHash = await bcrypt.hash('testpassword123', 10);
  await pool.query(
    'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
    ['test@example.com', passwordHash, 'driver', 'Test', 'User']
  );
  console.log('Test user created');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});