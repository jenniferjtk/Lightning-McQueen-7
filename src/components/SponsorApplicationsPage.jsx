import React, { useEffect, useState } from 'react';

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SponsorApplicationsPage({ user, onPendingCountChange }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [decidingId, setDecidingId] = useState(null);
  const [decideError, setDecideError] = useState('');

  useEffect(() => {
    fetch('/api/applications')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load applications.')))
      .then(setApplications)
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, [user.sponsorId]);

  useEffect(() => {
    if (!loading && !loadError) {
      onPendingCountChange(applications.filter((application) => application.status === 'pending').length);
    }
  }, [applications, loading, loadError, onPendingCountChange]);

  const decide = async (applicationId, decision) => {
    setDecidingId(applicationId);
    setDecideError('');
    try {
      const response = await fetch(`/api/applications/${applicationId}/decide`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Something went wrong.');
      setApplications((current) => current.map((application) => (
        application.application_id === applicationId
          ? { ...application, status: data.status, decided_at: new Date().toISOString() }
          : application
      )));
    } catch (error) {
      setDecideError(error.message);
    } finally {
      setDecidingId(null);
    }
  };

  const visibleApplications = filter === 'all'
    ? applications
    : applications.filter((application) => application.status === filter);

  return (
    <main className="applications-page">
      <section className="applications-page__intro">
        <p className="applications-page__eyebrow">Applications</p>
        <h1>Review driver applications.</h1>
        <p>See who has applied to your program, and approve or reject pending applications.</p>
      </section>

      {loading ? (
        <p className="applications-page__empty">Loading applications...</p>
      ) : loadError ? (
        <p className="applications-page__empty" role="alert">{loadError}</p>
      ) : (
        <section className="card">
          <div className="dashboard__tabs" aria-label="Filter applications by status">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={filter === option.value ? 'dashboard__tab dashboard__tab--active' : 'dashboard__tab'}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {decideError && <p className="applications-table__error" role="alert">{decideError}</p>}

          {visibleApplications.length === 0 ? (
            <p className="applications-page__empty">
              {filter === 'all' ? 'No drivers have applied yet.' : `No ${filter} applications.`}
            </p>
          ) : (
            <table className="applications-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Email</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleApplications.map((application) => (
                  <tr key={application.application_id}>
                    <td>{application.first_name} {application.last_name}</td>
                    <td>{application.email}</td>
                    <td>{formatDate(application.submitted_at)}</td>
                    <td>
                      <span className={`applications-table__status applications-table__status--${application.status}`}>
                        {application.status}
                      </span>
                    </td>
                    <td>
                      {application.status === 'pending' && (
                        <div className="applications-table__actions">
                          <button
                            type="button"
                            className="applications-table__decide applications-table__decide--approve"
                            disabled={decidingId === application.application_id}
                            onClick={() => decide(application.application_id, 'approved')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="applications-table__decide applications-table__decide--reject"
                            disabled={decidingId === application.application_id}
                            onClick={() => decide(application.application_id, 'rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
