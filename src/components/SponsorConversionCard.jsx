import React, { useEffect, useState } from 'react';

const formatRate = (rate) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
}).format(Number(rate));

export default function SponsorConversionCard({ userRole }) {
  const isSponsor = userRole === 'sponsor';
  const [sponsorName, setSponsorName] = useState('');
  const [rate, setRate] = useState(null);
  const [draftRate, setDraftRate] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const endpoint = isSponsor ? '/api/sponsor/conversion' : '/api/driver/conversion';
    fetch(endpoint, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load the point value.');
        return data;
      })
      .then((data) => {
        setSponsorName(data.sponsorName || '');
        setRate(data.pointConversionRate);
        setDraftRate(data.pointConversionRate == null ? '' : String(data.pointConversionRate));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [isSponsor]);

  const saveRate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/sponsor/conversion', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pointConversionRate: draftRate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save the point value.');
      setRate(data.pointConversionRate);
      setDraftRate(String(data.pointConversionRate));
      setSponsorName(data.sponsorName || sponsorName);
      setEditing(false);
      setMessage('Point value updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card sponsor-conversion-card" aria-labelledby="sponsor-conversion-title">
      <div className="sponsor-conversion-card__header">
        <div>
          <h2 className="card__title" id="sponsor-conversion-title">Point value</h2>
          {sponsorName && <p className="sponsor-conversion-card__sponsor">{sponsorName}</p>}
        </div>
        {isSponsor && !loading && rate !== null && !editing && (
          <button className="sponsor-conversion-card__edit" type="button" onClick={() => { setEditing(true); setMessage(''); }}>
            Edit
          </button>
        )}
      </div>

      {loading ? (
        <p className="sponsor-conversion-card__state">Loading point value...</p>
      ) : error ? (
        <p className="sponsor-conversion-card__state sponsor-conversion-card__state--error" role="alert">{error}</p>
      ) : rate === null ? (
        <p className="sponsor-conversion-card__state">No approved sponsor conversion is available yet.</p>
      ) : editing ? (
        <form className="sponsor-conversion-card__form" onSubmit={saveRate}>
          <label htmlFor="point-conversion-rate">Dollars per point</label>
          <div className="sponsor-conversion-card__input-row">
            <span aria-hidden="true">$</span>
            <input
              id="point-conversion-rate"
              type="number"
              min="0.0001"
              max="999999.9999"
              step="0.0001"
              value={draftRate}
              onChange={(event) => setDraftRate(event.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="sponsor-conversion-card__actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save value'}</button>
            <button type="button" className="sponsor-conversion-card__cancel" disabled={saving} onClick={() => { setDraftRate(String(rate)); setEditing(false); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="sponsor-conversion-card__rate"><strong>1 point</strong><span>=</span><strong>{formatRate(rate)}</strong><span>USD</span></p>
      )}
      {message && <p className="sponsor-conversion-card__state" role="status">{message}</p>}
    </section>
  );
}