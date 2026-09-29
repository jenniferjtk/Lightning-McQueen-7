const { getPool } = require('../db');

module.exports.handler = async () => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT sprint_number AS sprintNumber,
              DATE_FORMAT(release_date, '%m/%d/%Y') AS releaseDate
       FROM about_page
       ORDER BY sprint_number DESC, release_date DESC
       LIMIT 1`
    );
    if (!rows.length) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No sprint release information is available.' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(rows[0]),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};