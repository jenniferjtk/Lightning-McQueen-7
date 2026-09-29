const { getPool } = require('../../db');

const DECISIONS = ['approved', 'rejected'];

module.exports.handler = async (event) => {
  // TODO: sponsorId should come from a verified session/token once
  // auth (JWT vs. session) is decided — for now it's trusted client input.
  const applicationId = event.pathParameters && event.pathParameters.applicationId;
  const { sponsorId, decision } = JSON.parse(event.body || '{}');

  if (!applicationId || !sponsorId || !decision) {
    return { statusCode: 400, body: JSON.stringify({ error: 'applicationId, sponsorId and decision are required' }) };
  }
  if (!DECISIONS.includes(decision)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'decision must be "approved" or "rejected"' }) };
  }

  try {
    const pool = getPool();

    const [rows] = await pool.query(
      'SELECT sponsor_id, status FROM driver_applications WHERE application_id = ?',
      [applicationId]
    );
    if (rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No application found with that id' }) };
    }
    if (Number(rows[0].sponsor_id) !== Number(sponsorId)) {
      return { statusCode: 403, body: JSON.stringify({ error: 'This application belongs to a different sponsor' }) };
    }
    if (rows[0].status !== 'pending') {
      return { statusCode: 409, body: JSON.stringify({ error: `Cannot decide an application with status "${rows[0].status}"` }) };
    }

    // status = 'pending' in the WHERE guards against a withdraw or second
    // decision landing between the SELECT above and this UPDATE.
    const [result] = await pool.query(
      "UPDATE driver_applications SET status = ?, decided_at = NOW() WHERE application_id = ? AND status = 'pending'",
      [decision, applicationId]
    );
    if (result.affectedRows === 0) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Application is no longer pending' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ application_id: Number(applicationId), status: decision }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
