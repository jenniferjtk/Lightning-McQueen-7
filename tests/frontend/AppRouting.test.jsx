// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../../src/App.jsx';

// Renders the whole app for a signed-in user at a given path. Page tests
// render their component directly, so only this catches a page that App
// no longer imports or routes to (e.g. after a merge).
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); window.history.pushState({}, '', '/'); });

const json = (body) => ({ ok: true, status: 200, json: async () => body });

function renderAs(role, path, driver = {}, orders = [], { notifications = [], conversions = [], catalogs = {}, pointRules = [] } = {}) {
  window.history.pushState({}, '', path);
  const user = { id: 1, email: 'user@test.com', role, firstName: 'Test', lastName: 'User', sponsorId: role === 'sponsor' ? 1 : null };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.includes('/api/auth/me')) return json({ user });
    if (url === '/api/driver') return json({ id: 1, name: 'Test User', sponsorName: '', points: 0, balanceNotifications: [], recentPurchases: [], ...driver });
    if (url === '/api/driver/conversion') return json({ conversions });
    if (url === '/api/driver/notifications') return json({ notifications });
    if (/\/api\/driver\/notifications\/\d+\/read/.test(url)) return json({});
    if (url === '/api/orders') return json({ orders });
    if (url === '/api/sponsor/points/transactions') return json({ entries: [] });
    if (url.includes('/api/sponsor/drivers')) return json({ sponsorLinked: true, drivers: [] });
    if (url.includes('/api/sponsor-rules')) return json({ rules: pointRules });
    if (url.includes('/api/sponsors/') && url.includes('/catalog')) {
      const sponsorId = Number(url.match(/sponsors\/(\d+)\/catalog/)?.[1]);
      return json(catalogs[sponsorId] || { products: [], categories: [], stale: false });
    }
    if (url.includes('/api/reports/audit-log')) return json({ entries: [] });
    if (url.includes('/api/reports/sponsor-points')) return json({ entries: [] });
    if (url.includes('/api/admin/reports/sales/options')) return json({ sponsors: [], drivers: [] });
    if (url.includes('/api/admin/reports/sales')) return json({ entries: [] });
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

it('shows non-canceled catalog orders in the dashboard purchase section', async () => {
  renderAs('driver', '/', {}, [
    { orderId: 7, productTitle: 'Hard Drive', pointCost: 50, createdAt: '2026-11-04T15:30:00Z', status: 'pending' },
    { orderId: 6, productTitle: 'Canceled Monitor', pointCost: 599, createdAt: '2026-11-03T15:30:00Z', status: 'canceled' },
  ]);

  const table = await screen.findByRole('table');
  expect(within(table).getByText('Hard Drive')).toBeInTheDocument();
  expect(within(table).queryByText('Canceled Monitor')).not.toBeInTheDocument();
});

it('shows a balance and point value tab for each sponsor and keeps both cards in sync', async () => {
  renderAs('driver', '/', {
    points: 0,
    sponsors: [
      { id: 10, name: 'Acme Trucking', points: 0, pointConversionRate: 0 },
      { id: 11, name: 'Roadrunner Logistics', points: 0, pointConversionRate: 0 },
    ],
  }, [], { catalogs: {
    10: { pointBalance: 210, pointConversionRate: 0.01, products: [] },
    11: { pointBalance: 50, pointConversionRate: 0.02, products: [] },
  } });

  expect(await screen.findByText('$0.01')).toBeInTheDocument();
  expect(screen.getByText('210')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('tab', { name: 'Roadrunner Logistics' })[0]);
  expect(await screen.findByText('$0.02')).toBeInTheDocument();
  expect(screen.getByText('50')).toBeInTheDocument();
});

it('shows favorited catalog items in the driver dashboard saved tab', async () => {
  localStorage.setItem('driver-catalog-favorites-1', JSON.stringify([5]));
  renderAs('driver', '/', {
    sponsors: [{ id: 10, name: 'Acme Trucking', points: 0 }],
  }, [], { catalogs: {
    10: { products: [{ productId: 5, title: 'Backpack', pointCost: 250 }], categories: [], stale: false },
  } });

  await screen.findByRole('button', { name: 'Recent Purchases' });
  fireEvent.click(screen.getByRole('button', { name: 'Saved Items' }));
  const savedItems = await screen.findByRole('region', { name: 'Saved Items' });
  expect(within(savedItems).getByText('Backpack')).toBeInTheDocument();
  expect(within(savedItems).getByText('Saved at Acme Trucking')).toBeInTheDocument();
  expect(within(savedItems).getByText('250 pts')).toBeInTheDocument();
});

it('hides purchases and saved items from the sponsor dashboard', async () => {
  renderAs('sponsor', '/');

  expect(await screen.findByRole('heading', { name: 'Point transaction backlog' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Recent Purchases' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Saved Items' })).not.toBeInTheDocument();
});

it('shows read-only point rules in sponsor tabs on the driver point page', async () => {
  renderAs('driver', '/points', {
    sponsors: [
      { id: 10, name: 'Acme Trucking' },
      { id: 11, name: 'Roadrunner Logistics' },
    ],
  }, [], { pointRules: [
    { rule_id: 1, sponsor_id: 10, pt_value: 25, description: 'Safe driving bonus', frequency: 'one-time' },
    { rule_id: 2, sponsor_id: 11, pt_value: 40, description: 'On-time delivery', frequency: 'recurring' },
  ] });

  expect(await screen.findByRole('heading', { name: 'Your point rules.' })).toBeInTheDocument();
  expect(screen.getByText('25 pts')).toBeInTheDocument();
  expect(screen.getByText('Safe driving bonus')).toBeInTheDocument();
  expect(screen.queryByText('On-time delivery')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add another rule|Edit|Delete/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));
  expect(screen.getByText('40 pts')).toBeInTheDocument();
  expect(screen.getByText('On-time delivery')).toBeInTheDocument();
  expect(screen.queryByText('Safe driving bonus')).not.toBeInTheDocument();
});

it('shows and dismisses approval and dropped-sponsor notifications', async () => {
  renderAs('driver', '/', {}, [], { notifications: [
    { id: 9, type: 'application_approved', sponsorName: 'Acme Trucking' },
    { id: 10, type: 'sponsor_dropped', sponsorName: 'Roadrunner Logistics' },
  ] });

  expect(await screen.findByText('Your application to Acme Trucking was approved.')).toBeInTheDocument();
  expect(screen.getByText('Roadrunner Logistics has ended your sponsor affiliation.')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
  await waitFor(() => expect(screen.queryByText('Your application to Acme Trucking was approved.')).not.toBeInTheDocument());
});

it('notifies a driver when a favorited out-of-stock item returns to stock', async () => {
  localStorage.setItem('driver-catalog-favorites-1', JSON.stringify([9]));
  localStorage.setItem('driver-catalog-stock-snapshot-1', JSON.stringify({ '10:9': 0 }));
  renderAs('driver', '/', { sponsors: [{ id: 10, name: 'Acme Trucking', points: 5 }] }, [], {
    catalogs: { 10: { products: [{ productId: 9, title: 'Hard Drive', stockQuantity: 4 }] } },
  });

  expect(await screen.findByText('Hard Drive is back in stock at Acme Trucking.')).toBeInTheDocument();
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
  expect(await screen.findByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Sponsor Report' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Choose a report' }), {
    target: { value: 'sponsor-points' },
  });
  expect(await screen.findByRole('heading', { name: 'Sponsor Report' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Audit Log' })).not.toBeInTheDocument();
});

it('routes administrators to Admin Reports', async () => {
  renderAs('admin', '/admin/reports');
  expect(await screen.findByRole('heading', { name: 'Admin Reports' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sales Reports' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Admin Reports' })).toBeInTheDocument();
});

it('keeps non-admins out of Admin Reports', async () => {
  renderAs('sponsor', '/admin/reports');
  expect(await screen.findByRole('heading', { name: 'Point transaction backlog' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Admin Reports' })).not.toBeInTheDocument();
});

it('shows the reports page and navigation link for sponsors', async () => {
  renderAs('sponsor', '/reports');
  expect(await screen.findByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Sponsor Report' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Choose a report' }), {
    target: { value: 'sponsor-points' },
  });
  expect(await screen.findByRole('heading', { name: 'Sponsor Report' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Audit Log' })).not.toBeInTheDocument();
});

it('keeps drivers out of sponsor-only pages', async () => {
  renderAs('driver', '/sponsor/catalog');
  expect(await screen.findByText('Recent point updates')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Product catalog.' })).not.toBeInTheDocument();
});
