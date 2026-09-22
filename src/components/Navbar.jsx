import React from 'react';

const LINKS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Point Management', href: '/points' },
  { label: 'Catalog' },
  { label: 'About Page', href: '/about' },
];

export default function Navbar({ driverName, onLogout, accountHref = '/account' }) {
  const initials = (driverName || 'Driver').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'D';

  return (
    <header className="navbar">
      <div className="navbar__brand">
        <span className="navbar__mark" aria-hidden="true" />
        Lightning McQueen
      </div>

      <nav className="navbar__links" aria-label="Main navigation">
        {LINKS.map((link) => link.href ? (
          <a key={link.label} className="navbar__link" href={link.href}>
            {link.label}
          </a>
        ) : (
          <button key={link.label} className="navbar__link" type="button">
            {link.label}
          </button>
        ))}
      </nav>

      <a className="navbar__user" href={accountHref} aria-label="View account information">
        <span className="navbar__avatar" aria-hidden="true">{initials}</span>
      </a>
      <button className="navbar__logout" type="button" onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        onLogout();
      }}>Log out</button>
    </header>
  );
}
