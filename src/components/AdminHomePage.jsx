import React from 'react';

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

        <article className="admin-action-card">
          <p className="admin-action-card__label">User Log</p>
          <h2>View Log of Created Users</h2>
          <p>Review the log of all users created in the system.</p>
          <button type="button" onClick={() => onPageChange('user-log')}>View user log</button>
        </article>
      </section>
    </main>
  );
}
