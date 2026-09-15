import React from 'react';

export default function AboutPage() {
  return (
    <main className="about-page">
      <section className="about-page__intro">
        <p className="about-page__eyebrow">Lightning McQueen Rewards</p>
        <h1>Built for drivers who go the extra mile.</h1>
        <p className="about-page__summary">
          Track your rewards, manage your points, and make every mile count.
          This dashboard keeps your driver benefits in one place.
        </p>
      </section>

      <section className="about-page__details" aria-label="About the rewards program">
        <div className="about-page__detail">
          <span className="about-page__number">01</span>
          <h2>Earn points</h2>
          <p>Collect points through qualifying purchases and driver activities.</p>
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