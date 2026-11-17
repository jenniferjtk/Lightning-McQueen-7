import React from 'react';

export default function PointsCard({ points, sponsors = [], selectedSponsorId, onSponsorChange }) {
  const activeSponsor = sponsors.find((sponsor) => Number(sponsor.id) === Number(selectedSponsorId)) || sponsors[0];
  const displayedPoints = sponsors.length > 1 ? Number(activeSponsor?.points || 0) : Number(points || 0);

  return (
    <section className="card points-card">
      {sponsors.length > 1 && (
        <div className="points-card__tabs" role="tablist" aria-label="Point balance by sponsor">
          {sponsors.map((sponsor) => (
            <button
              key={sponsor.id}
              type="button"
              role="tab"
              aria-selected={Number(activeSponsor?.id) === Number(sponsor.id)}
              onClick={() => onSponsorChange?.(sponsor.id)}
            >{sponsor.name}</button>
          ))}
        </div>
      )}
      <span className="points-card__label">{sponsors.length > 1 ? `${activeSponsor?.name} point balance` : 'Current point balance'}</span>
      <span className="points-card__value">{displayedPoints.toLocaleString()}</span>
      <span className="points-card__sub">{sponsors.length > 1 ? 'Points available with this sponsor' : 'Total available points'}</span>
    </section>
  );
}
