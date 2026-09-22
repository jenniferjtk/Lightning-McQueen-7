const { getPool } = require('../../db');

module.exports.handler = async (event) => {
  // TODO: driverUserId should come from a verified session/token once
  // auth (JWT vs. session) is decided — for now it's trusted client input.
  const applicationId = event.pathParameters && event.pathParameters.applicationId;
  const { driverUserId } = JSON.parse(event.body || '{}');

  if (!applicationId || !driverUserId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'applicationId and driverUserId are required' }) };
  }

  try {
    const pool = getPool();

    const [rows] = await pool.query(
      'SELECT status FROM driver_applications WHERE application_id = ? AND driver_user_id = ?',
      [applicationId, driverUserId]
    );
    if (rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No matching application found for this driver' }) };
    }
    if (rows[0].status !== 'pending') {
      return { statusCode: 409, body: JSON.stringify({ error: `Cannot withdraw an application with status "${rows[0].status}"` }) };
    }

    await pool.query(
      "UPDATE driver_applications SET status = 'withdrawn' WHERE application_id = ?",
      [applicationId]
    );

    return { statusCode: 200, body: JSON.stringify({ application_id: Number(applicationId), status: 'withdrawn' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
