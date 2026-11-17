// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SponsorOrdersPage from '../../src/components/SponsorOrdersPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const order = (orderId, driver, status, pointCost) => ({
  orderId, productTitle: `Item ${orderId}`, pointCost, status, createdAt: '2026-11-15T12:00:00.000Z', driver,
});
const dana = { id: 1, name: 'Dana Driver', email: 'dana@example.com' };
const otto = { id: 4, name: 'Otto Other', email: 'otto@example.com' };

const respond = (body, ok = true) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));

it('shows each order with the points removed and totals that skip canceled orders', async () => {
  respond({ orders: [order(3, dana, 'pending', 500), order(2, otto, 'shipped', 1200), order(1, dana, 'canceled', 300)] });
  render(<SponsorOrdersPage />);
  const table = await screen.findByRole('table');
  expect(fetch).toHaveBeenCalledWith('/api/sponsor/orders', { credentials: 'include' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('#3');
  expect(rows[0]).toHaveTextContent('Dana Driver');
  expect(rows[0]).toHaveTextContent('−500 pts');
  expect(rows[2]).toHaveTextContent('300 pts returned');
  expect(screen.getByText('Active orders').nextSibling).toHaveTextContent('2');
  expect(screen.getByText('Points removed', { selector: 'dt' }).nextSibling).toHaveTextContent('1,700 pts');
  expect(screen.getByText('Points returned from cancellations').nextSibling).toHaveTextContent('300 pts');
});

it('filters orders and totals by driver', async () => {
  respond({ orders: [order(3, dana, 'pending', 500), order(2, otto, 'shipped', 1200)] });
  render(<SponsorOrdersPage />);
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Driver'), { target: { value: '4' } });
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toHaveTextContent('Otto Other');
  expect(screen.getByText('Points removed', { selector: 'dt' }).nextSibling).toHaveTextContent('1,200 pts');
});

it('explains when there are no orders yet', async () => {
  respond({ orders: [] });
  render(<SponsorOrdersPage />);
  expect(await screen.findByText('No orders yet')).toBeInTheDocument();
});

it('shows the server error', async () => {
  respond({ message: 'Your account is not linked to a sponsor organization.' }, false);
  render(<SponsorOrdersPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('not linked');
});
