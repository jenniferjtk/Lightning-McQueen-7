import React from 'react';

const LINKS = ['Dashboard', 'Point Management', 'Catalog', 'About Page'];

export default function Navbar({ driverName }) {
  return (
    <header className="navbar">
      <div className="navbar__brand">
        <span className="navbar__mark" aria-hidden="true" />
        Lightning McQueen
      </div>

      <nav className="navbar__links" aria-label="Main navigation">
        {LINKS.map((link) => (
          <button key={link} className="navbar__link" type="button">
            {link}
          </button>
        ))}
      </nav>

      <div className="navbar__user">{driverName || 'Driver'}</div>
    </header>
  );
}
