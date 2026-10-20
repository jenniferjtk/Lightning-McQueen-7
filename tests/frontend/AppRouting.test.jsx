// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../../src/App.jsx';

// Renders the whole app for a signed-in user at a given path. Page tests
// render their component directly, so only this catches a page that App
// no longer imports or routes to (e.g. after a merge).
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.pushState({}, '', '/'); });

const json = (body) => ({ ok: true, status: 200, json: async () => body });

function renderAs(role, path) {
  window.history.pushState({}, '', path);
  const user = { id: 1, email: 'user@test.com', role, firstName: 'Test', lastName: 'User', sponsorId: role === 'sponsor' ? 1 : null };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.includes('/api/auth/me')) return json({ user });
    if (url === '/api/driver') return json({ id: 1, name: 'Test User', sponsorName: '', points: 0, balanceNotifications: [], recentPurchases: [] });
    if (url.includes('/api/sponsor/drivers')) return json({ sponsorLinked: true, drivers: [] });
    if (url.includes('/api/sponsor-rules')) return json({ rules: [] });
    if (url.includes('/catalog')) return json({ products: [], categories: [], stale: false });
    return json([]);
  }));
  const errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(String(args[0])));
  render(<App />);
  return errors;
}

it('renders the driver dashboard with point charts without crashing', async () => {
  const errors = renderAs('driver', '/');
  expect(await screen.findByText('Recent point updates')).toBeInTheDocument();
  expect(errors.filter((error) => /ReferenceError|is not defined/.test(error))).toEqual([]);
});

it('routes sponsors to the driver management page', async () => {
  renderAs('sponsor', '/sponsor/drivers');
  expect(await screen.findByRole('heading', { level: 1, name: 'Driver management.' })).toBeInTheDocument();
});

it('routes sponsors to the catalog page', async () => {
  renderAs('sponsor', '/sponsor/catalog');
  expect(await screen.findByRole('heading', { level: 1, name: 'Product catalog.' })).toBeInTheDocument();
});

it('keeps drivers out of sponsor-only pages', async () => {
  renderAs('driver', '/sponsor/catalog');
  expect(await screen.findByText('Recent point updates')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Product catalog.' })).not.toBeInTheDocument();
});
