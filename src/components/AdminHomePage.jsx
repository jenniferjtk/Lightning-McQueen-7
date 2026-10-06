import React, { useEffect, useState } from 'react';

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
        setSelections(Object.fromEntries(data.sponsors.map((sponsor) => [sponsor.sponsor_id, sponsor.sponsor_user_id || ''])));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const saveLink = async (sponsorId) => {
    setSavingId(sponsorId);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/sponsor-links/${sponsorId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorUserId: selections[sponsorId] || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save sponsor account link.');
      setSponsors((current) => current.map((sponsor) => sponsor.sponsor_id === sponsorId
        ? { ...sponsor, sponsor_user_id: selections[sponsorId] || null }
        : sponsor));
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingId(null);
    }
  };

  const claimedElsewhere = (accountId, sponsorId) => sponsors.some((sponsor) => (
    sponsor.sponsor_id !== sponsorId && String(sponsor.sponsor_user_id) === String(accountId)
  ));

  return (
    <section className="card admin-sponsor-links" aria-labelledby="sponsor-links-title">
      <div className="admin-sponsor-links__header">
        <div>
          <h2 className="card__title" id="sponsor-links-title">Sponsor account access</h2>
          <p>Link each sponsor login to the organization it manages.</p>
        </div>
      </div>
      {loading ? <p className="admin-sponsor-links__state">Loading sponsor organizations...</p> : sponsors.length === 0 ? (
        <p className="admin-sponsor-links__state">No sponsor organizations are configured.</p>
      ) : sponsorUsers.length === 0 ? (
        <p className="admin-sponsor-links__state">No sponsor accounts are available to link.</p>
      ) : (
        <div className="admin-sponsor-links__rows">
          {sponsors.map((sponsor) => (
            <div className="admin-sponsor-links__row" key={sponsor.sponsor_id}>
              <strong>{sponsor.name}</strong>
              <label>
                <span className="sr-only">Account for {sponsor.name}</span>
                <select
                  value={selections[sponsor.sponsor_id]}
                  onChange={(event) => setSelections((current) => ({ ...current, [sponsor.sponsor_id]: event.target.value }))}
                  disabled={savingId !== null}
                >
                  <option value="">No account linked</option>
                  {sponsorUsers.map((account) => (
                    <option
                      key={account.user_id}
                      value={account.user_id}
                      disabled={claimedElsewhere(account.user_id, sponsor.sponsor_id)}
                    >
                      {account.first_name} {account.last_name} · {account.email}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => saveLink(sponsor.sponsor_id)} disabled={savingId !== null}>
                {savingId === sponsor.sponsor_id ? 'Saving...' : 'Save link'}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="admin-sponsor-links__state admin-sponsor-links__state--error" role="alert">{error}</p>}
      {message && <p className="admin-sponsor-links__state" role="status">{message}</p>}
    </section>
  );
}

export default function AdminHomePage({ user, onPageChange }) {
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
          <p className="admin-action-card__label">Manage Drivers</p>
          <h2>Manage driver accounts</h2>
          <p>Create, update, or delete driver profiles and their associated information.</p>
          <button type="button" onClick={() => onPageChange('drivers')}>Open driver management</button>
        </article>
      </section>
      <SponsorAccountLinks />
    </main>
  );
}
