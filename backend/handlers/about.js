const { getPool } = require('../db');

module.exports.handler = async () => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'DB connection works', result: rows[0].result }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};