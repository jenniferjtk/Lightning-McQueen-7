import React, { useEffect, useState } from 'react';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MyApplicationPage({ user }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [withdrawError, setWithdrawError] = useState('');

  const loadApplications = () => {
    setLoading(true);
    setLoadError('');
    return fetch(`/api/applications?driverUserId=${encodeURIComponent(user.id)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load your applications.')))
      .then(setApplications)
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withdraw = async (applicationId) => {
    setWithdrawingId(applicationId);
    setWithdrawError('');
    try {
      const response = await fetch(`/api/applications/${applicationId}/withdraw`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverUserId: user.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong.');
      await loadApplications();
    } catch (error) {
      setWithdrawError(error.message);
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <main className="applications-page">
      <section className="applications-page__intro">
        <p className="applications-page__eyebrow">My Application</p>
        <h1>Track your sponsor applications.</h1>
        <p>See where each application stands, and withdraw one if you change your mind.</p>
      </section>

      {loading ? (
        <p className="applications-page__empty">Loading your applications...</p>
      ) : loadError ? (
        <p className="applications-page__empty" role="alert">{loadError}</p>
      ) : applications.length === 0 ? (
        <p className="applications-page__empty">You haven't applied to a sponsor yet.</p>
      ) : (
        <section className="card">
          {withdrawError && <p className="applications-table__error" role="alert">{withdrawError}</p>}
          <table className="applications-table">
            <thead>
              <tr>
                <th>Sponsor</th>
                <th>Status</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.application_id}>
                  <td>{application.sponsor_name}</td>
                  <td>
                    <span className={`applications-table__status applications-table__status--${application.status}`}>
                      {application.status}
                    </span>
                  </td>
                  <td>{formatDate(application.submitted_at)}</td>
                  <td>
                    {application.status === 'pending' && (
                      <button
                        type="button"
                        className="applications-table__withdraw"
                        disabled={withdrawingId === application.application_id}
                        onClick={() => withdraw(application.application_id)}
                      >
                        {withdrawingId === application.application_id ? 'Withdrawing...' : 'Withdraw'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
