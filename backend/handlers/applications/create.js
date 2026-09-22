const { getPool } = require('../../db');

module.exports.handler = async (event) => {
  // TODO: driverUserId should come from a verified session/token once
  // auth (JWT vs. session) is decided — for now it's trusted client input.
  const { driverUserId, sponsorId } = JSON.parse(event.body);

  if (!driverUserId || !sponsorId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'driverUserId and sponsorId are required' }) };
  }

  try {
    const pool = getPool();

    const [sponsorRows] = await pool.query('SELECT sponsor_id FROM sponsors WHERE sponsor_id = ?', [sponsorId]);
    if (sponsorRows.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No sponsor found for that sponsorId' }) };
    }

    const [result] = await pool.query(
      'INSERT INTO driver_applications (driver_user_id, sponsor_id, status) VALUES (?, ?, ?)',
      [driverUserId, sponsorId, 'pending']
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        application_id: result.insertId,
        sponsor_id: sponsorId,
        status: 'pending',
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
