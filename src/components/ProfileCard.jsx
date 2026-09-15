import React from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ProfileCard({ name, dateJoined, sponsorName }) {
  return (
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
          <dt>Sponsor</dt>
          <dd>{sponsorName || '—'}</dd>
        </div>
      </dl>
    </section>
  );
}
