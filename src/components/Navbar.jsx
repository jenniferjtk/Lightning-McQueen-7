import React from 'react';

const LINKS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Point Management' },
  { label: 'Catalog' },
  { label: 'About Page', href: '/about' },
];

export default function Navbar({ driverName }) {
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

      <div className="navbar__user">{driverName || 'Driver'}</div>
    </header>
  );
}
