import React from 'react';

export default function PointsCard({ points }) {
  return (
    <section className="card points-card">
      <span className="points-card__label">Current point balance</span>
      <span className="points-card__value">{points.toLocaleString()}</span>
      <span className="points-card__sub">Redeemable through your sponsor's rewards catalog</span>
    </section>
  );
}
