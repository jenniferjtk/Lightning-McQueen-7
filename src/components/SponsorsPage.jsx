import React, { useEffect, useState } from 'react';

export default function SponsorsPage({ user }) {
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [applyingId, setApplyingId] = useState(null);
  const [applyMessages, setApplyMessages] = useState({});

  useEffect(() => {
    fetch('/api/sponsors')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load sponsors.')))
      .then(setSponsors)
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, []);

  const apply = async (sponsorId) => {
    setApplyingId(sponsorId);
    setApplyMessages((current) => ({ ...current, [sponsorId]: null }));
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverUserId: user.id, sponsorId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong.');
      setApplyMessages((current) => ({ ...current, [sponsorId]: { type: 'success', text: 'Application submitted!' } }));
    } catch (error) {
      setApplyMessages((current) => ({ ...current, [sponsorId]: { type: 'error', text: error.message } }));
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <main className="sponsors-page">
      <section className="sponsors-page__intro">
        <p className="sponsors-page__eyebrow">Sponsors</p>
        <h1>Find a sponsor to drive for.</h1>
        <p>Browse available sponsors and submit an application to join their rewards program.</p>
      </section>

      {loading ? (
        <p className="sponsors-page__empty">Loading sponsors...</p>
      ) : loadError ? (
        <p className="sponsors-page__empty" role="alert">{loadError}</p>
      ) : sponsors.length === 0 ? (
        <p className="sponsors-page__empty">No sponsors available yet.</p>
      ) : (
        <div className="sponsor-cards">
          {sponsors.map((sponsor) => {
            const message = applyMessages[sponsor.sponsor_id];
            return (
              <section className="card sponsor-card" key={sponsor.sponsor_id}>
                <h2 className="card__title">{sponsor.name}</h2>
                {sponsor.description && <p className="sponsor-card__description">{sponsor.description}</p>}
                <p className="sponsor-card__rate">
                  {Number(sponsor.point_conversion_rate).toFixed(2)} points per dollar
                </p>
                <button
                  type="button"
                  className="sponsor-card__apply"
                  disabled={applyingId === sponsor.sponsor_id}
                  onClick={() => apply(sponsor.sponsor_id)}
                >
                  {applyingId === sponsor.sponsor_id ? 'Applying...' : 'Apply'}
                </button>
                {message && (
                  <p className={message.type === 'error' ? 'sponsor-card__message sponsor-card__message--error' : 'sponsor-card__message sponsor-card__message--success'} role="alert">
                    {message.text}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
