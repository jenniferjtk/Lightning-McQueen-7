const { getPool } = require('../../db');

module.exports.handler = async (event) => {
  // TODO: driverUserId should come from a verified session/token once
  // auth (JWT vs. session) is decided — for now it's trusted client input.
  const driverUserId = event.queryStringParameters && event.queryStringParameters.driverUserId;

  if (!driverUserId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'driverUserId query parameter is required' }) };
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT a.application_id, a.sponsor_id, s.name AS sponsor_name, a.status, a.submitted_at
       FROM driver_applications a
       JOIN sponsors s ON s.sponsor_id = a.sponsor_id
       WHERE a.driver_user_id = ?
       ORDER BY a.submitted_at DESC`,
      [driverUserId]
    );

    return { statusCode: 200, body: JSON.stringify(rows) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
