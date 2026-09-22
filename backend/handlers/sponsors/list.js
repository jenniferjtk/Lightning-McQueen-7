const { getPool } = require('../../db');

module.exports.handler = async () => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT sponsor_id, name, description, point_conversion_rate FROM sponsors ORDER BY name'
    );

    return { statusCode: 200, body: JSON.stringify(rows) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
