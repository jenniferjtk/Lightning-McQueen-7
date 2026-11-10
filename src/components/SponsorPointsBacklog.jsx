import React, { useEffect, useState } from 'react';

const formatAmount = (amount) => `${amount > 0 ? '+' : ''}${amount.toLocaleString()} pts`;

// A sponsor's own point-rule applications across all of its drivers.
export default function SponsorPointsBacklog() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/sponsor/points/transactions', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to load point transactions.');
        if (!Array.isArray(data.entries)) throw new Error('Unable to load point transactions.');
        if (active) {
          setEntries(data.entries);
          setError('');
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="card sponsor-points-backlog" aria-labelledby="sponsor-points-backlog-heading">
      <div className="sponsor-points-backlog__header">
        <h2 className="card__title" id="sponsor-points-backlog-heading">Point transaction backlog</h2>
        <button
          type="button"
          className="sponsor-points-backlog__toggle"
          aria-expanded={expanded}
          aria-controls="sponsor-points-backlog-content"
          onClick={() => setExpanded((isExpanded) => !isExpanded)}
        >
          {expanded ? 'Hide backlog' : 'Show backlog'}
        </button>
      </div>
      {expanded && <div id="sponsor-points-backlog-content">
        {error ? (
          <p className="sponsor-points-backlog__message" role="alert">{error}</p>
        ) : entries === null ? (
          <p className="sponsor-points-backlog__message">Loading point transactions...</p>
        ) : entries.length === 0 ? (
          <p className="sponsor-points-backlog__message">No point transactions yet.</p>
        ) : (
          <div className="sponsor-points-backlog__table-wrap">
            <table className="sponsor-points-backlog__table">
              <thead>
                <tr><th scope="col">Driver</th><th scope="col">Reason</th><th scope="col">Date</th><th scope="col">Points</th></tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const amount = Number(entry.amount);
                  return (
                    <tr key={entry.id}>
                      <td>{entry.driverName}</td>
                      <td>{entry.label}</td>
                      <td>{entry.date}</td>
                      <td className={amount < 0 ? 'sponsor-points-backlog__amount sponsor-points-backlog__amount--negative' : 'sponsor-points-backlog__amount sponsor-points-backlog__amount--positive'}>{formatAmount(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </section>
  );
}
