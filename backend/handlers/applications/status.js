const { getPool } = require('../../db');

const STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'];

module.exports.handler = async (event) => {
  // TODO: driverUserId/sponsorId should come from a verified session/token once
  // auth (JWT vs. session) is decided — for now it's trusted client input.
  const params = event.queryStringParameters || {};
  const { driverUserId, sponsorId, status } = params;

  if (!driverUserId && !sponsorId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'driverUserId or sponsorId query parameter is required' }) };
  }
  if (status && !STATUSES.includes(status)) {
    return { statusCode: 400, body: JSON.stringify({ error: `status must be one of: ${STATUSES.join(', ')}` }) };
  }

  try {
    const pool = getPool();

    if (driverUserId) {
      const [rows] = await pool.query(
        `SELECT a.application_id, a.sponsor_id, s.name AS sponsor_name, a.status, a.submitted_at
         FROM driver_applications a
         JOIN sponsors s ON s.sponsor_id = a.sponsor_id
         WHERE a.driver_user_id = ?
         ORDER BY a.submitted_at DESC`,
        [driverUserId]
      );
      return { statusCode: 200, body: JSON.stringify(rows) };
    }

    // Sponsor view: each application joined with the applying driver's profile.
    const [rows] = await pool.query(
      `SELECT a.application_id, a.status, a.submitted_at, a.decided_at,
              u.user_id AS driver_user_id, u.first_name, u.last_name, u.email
       FROM driver_applications a
       JOIN users u ON u.user_id = a.driver_user_id
       WHERE a.sponsor_id = ?${status ? ' AND a.status = ?' : ''}
       ORDER BY a.submitted_at DESC`,
      status ? [sponsorId, status] : [sponsorId]
    );
    return { statusCode: 200, body: JSON.stringify(rows) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
