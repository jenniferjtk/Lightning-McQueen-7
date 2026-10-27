import React, { useEffect, useState } from 'react';

function PointChangeReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/point-change-reports', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load point-change reports.');
        if (!Array.isArray(data.reports)) throw new Error('Unable to load point-change reports.');
        setReports(data.reports);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="card admin-point-reports">
      <h2 className="card__title">Suspicious point-change reports</h2>
      {loading ? (
        <p className="admin-sponsor-links__state">Loading reports...</p>
      ) : error ? (
        <p className="admin-sponsor-links__state admin-sponsor-links__state--error" role="alert">{error}</p>
      ) : reports.length === 0 ? (
        <p className="admin-sponsor-links__state">There are no point-change reports.</p>
      ) : (
        <div className="admin-point-reports__list">
          {reports.map((report) => (
            <article className="admin-point-reports__item" key={report.id}>
              <div>
                <h3>{report.driverName || 'Deleted driver'} · {report.description || 'Point adjustment'}</h3>
                <p>
                  {report.amount >= 0 ? '+' : '-'}{Math.abs(report.amount).toLocaleString()} pts
                  {' · '}{report.date}
                </p>
                <p>Reported by {report.reporterName || 'Deleted user'} ({report.reporterRole})</p>
              </div>
              <p className="admin-point-reports__details">{report.details}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SponsorAccountLinks() {
  const [sponsors, setSponsors] = useState([]);
  const [sponsorUsers, setSponsorUsers] = useState([]);
  const [selections, setSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/sponsor-links', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load sponsor accounts.');
        return data;
      })
      .then((data) => {
        setSponsors(data.sponsors);
        setSponsorUsers(data.sponsorUsers);
        setSelections(Object.fromEntries(data.sponsorUsers.map((account) => [account.user_id, account.sponsor_id ?? ''])));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const saveLink = async (userId) => {
    setSavingId(userId);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/sponsor-links/${userId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId: selections[userId] || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save sponsor account link.');
      setSponsorUsers((current) => current.map((account) => account.user_id === userId
        ? { ...account, sponsor_id: selections[userId] || null }
        : account));
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="card admin-sponsor-links" aria-labelledby="sponsor-links-title">
      <div className="admin-sponsor-links__header">
        <div>
          <h2 className="card__title" id="sponsor-links-title">Sponsor account access</h2>
          <p>Link each sponsor login to the organization it manages.</p>
        </div>
      </div>
      {loading ? <p className="admin-sponsor-links__state">Loading sponsor accounts...</p> : sponsorUsers.length === 0 ? (
        <p className="admin-sponsor-links__state">No sponsor accounts are available to link.</p>
      ) : sponsors.length === 0 ? (
        <p className="admin-sponsor-links__state">No sponsor organizations are configured.</p>
      ) : (
        <div className="admin-sponsor-links__rows">
          {sponsorUsers.map((account) => {
            const accountName = `${account.first_name} ${account.last_name}`;
            return (
              <div className="admin-sponsor-links__row" key={account.user_id}>
                <strong>{accountName} · {account.email}</strong>
                <label>
                  <span className="sr-only">Organization for {accountName}</span>
                  <select
                    value={selections[account.user_id]}
                    onChange={(event) => setSelections((current) => ({ ...current, [account.user_id]: event.target.value }))}
                    disabled={savingId !== null}
                  >
                    <option value="">No organization linked</option>
                    {sponsors.map((sponsor) => (
                      <option key={sponsor.sponsor_id} value={sponsor.sponsor_id}>{sponsor.name}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => saveLink(account.user_id)} disabled={savingId !== null}>
                  {savingId === account.user_id ? 'Saving...' : 'Save link'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="admin-sponsor-links__state admin-sponsor-links__state--error" role="alert">{error}</p>}
      {message && <p className="admin-sponsor-links__state" role="status">{message}</p>}
    </section>
  );
}

export default function AdminHomePage({ user, onPageChange, onPreviewRole }) {
  const name = user?.firstName || 'Administrator';

  return (
    <main className="admin-home-page">
      <section className="admin-home-page__hero">
        <p className="admin-home-page__eyebrow">Administration</p>
        <h1>Welcome back, {name}.</h1>
        <p>Manage the driver rewards program from one place.</p>
      </section>

      <section className="admin-home-page__actions" aria-label="Administration actions">
        <article className="admin-action-card">
          <p className="admin-action-card__label">Manage Users</p>
          <h2>Manage User accounts</h2>
          <p>Create, update, or delete User profiles and their associated information.</p>
          <button type="button" onClick={() => onPageChange('drivers')}>Open User management</button>
        </article>
      </section>
      <PointChangeReports />

      <SponsorAccountLinks />

      <section className="admin-view-preview" aria-labelledby="admin-view-preview-title">
        <div>
          <p className="admin-home-page__eyebrow">Preview portal</p>
          <h2 id="admin-view-preview-title">Test a user experience</h2>
          <p>Preview the driver or sponsor portal using your administrator account details.</p>
        </div>
        <div className="admin-view-preview__actions">
          <button type="button" onClick={() => onPreviewRole('driver')}>Preview driver view</button>
          <button type="button" onClick={() => onPreviewRole('sponsor')}>Preview sponsor view</button>
        </div>
      </section>
    </main>
  );
}
