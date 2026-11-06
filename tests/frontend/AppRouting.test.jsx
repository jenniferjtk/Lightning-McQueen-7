// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../../src/App.jsx';

// Renders the whole app for a signed-in user at a given path. Page tests
// render their component directly, so only this catches a page that App
// no longer imports or routes to (e.g. after a merge).
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.pushState({}, '', '/'); });

const json = (body) => ({ ok: true, status: 200, json: async () => body });

function renderAs(role, path, driver = {}) {
  window.history.pushState({}, '', path);
  const user = { id: 1, email: 'user@test.com', role, firstName: 'Test', lastName: 'User', sponsorId: role === 'sponsor' ? 1 : null };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.includes('/api/auth/me')) return json({ user });
    if (url === '/api/driver') return json({ id: 1, name: 'Test User', sponsorName: '', points: 0, balanceNotifications: [], recentPurchases: [], ...driver });
    if (url === '/api/sponsor/points/transactions') return json({ entries: [] });
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

it('warns drivers whose point balance is below zero', async () => {
  renderAs('driver', '/', { points: -1 });
  expect(await screen.findByRole('alert')).toHaveTextContent('Your point value has dropped below 0 and you are at risk of being dropped by your sponsor');
});

it('does not warn drivers whose point balance is zero or higher', async () => {
  renderAs('driver', '/', { points: 0 });
  await screen.findByText('Recent point updates');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('routes sponsors to the driver management page', async () => {
  renderAs('sponsor', '/sponsor/drivers');
  expect(await screen.findByRole('heading', { level: 1, name: 'Driver management.' })).toBeInTheDocument();
});

it('shows the point transaction backlog on the sponsor dashboard', async () => {
  renderAs('sponsor', '/');
  expect(await screen.findByRole('heading', { name: 'Point transaction backlog' })).toBeInTheDocument();
  const toggle = screen.getByRole('button', { name: 'Show backlog' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Hide backlog' })).toHaveAttribute('aria-expanded', 'true');
});

it('routes sponsors to the catalog page', async () => {
  renderAs('sponsor', '/sponsor/catalog');
  expect(await screen.findByRole('heading', { level: 1, name: 'Product catalog.' })).toBeInTheDocument();
});

it('shows the reports page and navigation link for admins', async () => {
  renderAs('admin', '/reports');
  expect(await screen.findByRole('heading', { name: 'Sponsor Report' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument();
});

it('shows the reports page and navigation link for sponsors', async () => {
  renderAs('sponsor', '/reports');
  expect(await screen.findByRole('heading', { name: 'Sponsor Report' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument();
});

it('keeps drivers out of sponsor-only pages', async () => {
  renderAs('driver', '/sponsor/catalog');
  expect(await screen.findByText('Recent point updates')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Product catalog.' })).not.toBeInTheDocument();
});
