import React from 'react';

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
