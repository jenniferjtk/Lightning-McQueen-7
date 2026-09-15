import React from 'react';

export default function AboutPage() {
  return (
    <main className="about-page">
      <section className="about-page__intro">
        <p className="about-page__eyebrow">Lightning McQueen</p>
        <h1>Good Driver Incentive Program</h1>
        <p className="about-page__summary">
          Team 07 | Sprint 01 | Released 09/15/2026
        </p>
      </section>

      <section className="about-page__details" aria-label="About the rewards program">
        <div className="about-page__detail">
          <span className="about-page__number">01</span>
          <h2>Earn points</h2>
          <p>Collect points by demonstrating good driving behavior (as defined by your sponsor).</p>
        </div>
        <div className="about-page__detail">
          <span className="about-page__number">02</span>
          <h2>See your progress</h2>
          <p>Review your balance and recent purchases from the dashboard.</p>
        </div>
        <div className="about-page__detail">
          <span className="about-page__number">03</span>
          <h2>Choose your rewards</h2>
          <p>Use your points in the catalog when you are ready to redeem.</p>
        </div>
      </section>
    </main>
  );
}