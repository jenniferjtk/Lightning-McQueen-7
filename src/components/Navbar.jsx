import React from 'react';

const DRIVER_LINKS = [
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Sponsors', value: 'sponsors' },
  { label: 'My Application', value: 'application' },
  { label: 'Point Management', value: 'points' },
  { label: 'About Page', value: 'about' },
];

const ADMIN_LINKS = [
  { label: 'Admin Home', value: 'admin' },
  { label: 'Drivers', value: 'drivers' },
  { label: 'Point Management', value: 'points' },
  { label: 'Sponsors', value: 'sponsors' },
  { label: 'About Page', value: 'about' },
];

const SPONSOR_LINKS = [
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Applications', value: 'sponsor-applications', showsPendingCount: true },
  { label: 'Point Management', value: 'points' },
  { label: 'About Page', value: 'about' },
];

export default function Navbar({ driverName, userRole, currentPage, pendingCount = 0, onPageChange, onLogout }) {
  const initials = (driverName || 'Driver').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'D';
  const links = userRole === 'admin' ? ADMIN_LINKS : userRole === 'sponsor' ? SPONSOR_LINKS : DRIVER_LINKS;

  return (
    <header className="navbar">
      <div className="navbar__brand">
        <span className="navbar__mark" aria-hidden="true" />
        Lightning McQueen
      </div>

      <nav className="navbar__links" aria-label="Main navigation">
        {links.map((link) => (
          <button
            key={link.value}
            type="button"
            className={currentPage === link.value ? 'navbar__link navbar__link--active' : 'navbar__link'}
            onClick={() => onPageChange(link.value)}
          >
            {link.label}
            {link.showsPendingCount && pendingCount > 0 && (
              <span className="navbar__badge" aria-label={`${pendingCount} pending`}>{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="navbar__user"
        aria-label="View account information"
        onClick={() => onPageChange('account')}
      >
        <span className="navbar__avatar" aria-hidden="true">{initials}</span>
      </button>
      <button className="navbar__logout" type="button" onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        onLogout();
      }}>Log out</button>
    </header>
  );
}
