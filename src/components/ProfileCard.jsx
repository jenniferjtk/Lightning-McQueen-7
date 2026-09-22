import React from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ProfileCard({ name, dateJoined, sponsorName, sponsor }) {
  const [showSponsorModal, setShowSponsorModal] = useState(false);

  return (
    <>
      <section className="card profile-card">
        <h2 className="card__title">Driver Profile</h2>
        <dl className="profile-card__list">
          <div className="profile-card__row">
            <dt>Name</dt>
            <dd>{name || '—'}</dd>
          </div>
          <div className="profile-card__row">
            <dt>Date joined</dt>
            <dd>{formatDate(dateJoined)}</dd>
          </div>
          <div className="profile-card__row">
            <dt>
              <button type="button" className="profile-card__sponsor-label" onClick={() => setShowSponsorModal(true)}>
                Sponsor
              </button>
            </dt>
            <dd>{sponsorName || '—'}</dd>
          </div>
        </dl>
      </section>

      {showSponsorModal && (
        <div className="sponsor-modal" role="dialog" aria-modal="true" aria-labelledby="sponsor-modal-title">
          <div className="sponsor-modal__backdrop" onClick={() => setShowSponsorModal(false)} />
          <div className="sponsor-modal__content">
            <div className="sponsor-modal__header">
              <h3 id="sponsor-modal-title">Sponsor</h3>
              <button type="button" className="sponsor-modal__close" onClick={() => setShowSponsorModal(false)} aria-label="Close sponsor details">
                ×
              </button>
            </div>

            <div className="sponsor-modal__body">
              <p>Contact information will appear here once sponsor details are added.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
