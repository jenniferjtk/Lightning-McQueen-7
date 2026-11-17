// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SponsorBillingReport from '../../src/components/SponsorBillingReport.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const purchase = (orderId, sponsorId, sponsorName, unitPrice, pointCost) => ({
  orderId, sponsorId, sponsorName, unitPrice, pointCost, status: 'pending', createdAt: '2026-11-10T15:00:00.000Z',
  driverName: 'Dana Driver', productTitle: `Item ${orderId}`,
});
const report = {
  sponsors: [
    { sponsorId: 10, sponsorName: 'Acme Freight', orderCount: 2, pointsRedeemed: 1500, amountDue: 15 },
    { sponsorId: 11, sponsorName: 'Blue Line', orderCount: 1, pointsRedeemed: 6400, amountDue: 64 },
  ],
  purchases: [purchase(3, 10, 'Acme Freight', 5, 500), purchase(2, 10, 'Acme Freight', 10, 1000), purchase(1, 11, 'Blue Line', 64, 6400)],
  totals: { orderCount: 3, pointsRedeemed: 7900, amountDue: 79 },
};
const respond = (body, ok = true) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));
const tables = () => screen.getAllByRole('table');

it('loads this month so far and shows the amount due per sponsor', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 17, 9));
  respond(report);
  render(<SponsorBillingReport />);

  await screen.findByRole('table', { name: 'Amount due by sponsor' });
  expect(fetch).toHaveBeenCalledWith('/api/admin/reports/sponsor-billing?startDate=2026-11-01&endDate=2026-11-17', { credentials: 'include' });
  expect(screen.getByText('Total to bill').nextSibling).toHaveTextContent('$79.00');
  const rows = within(tables()[0]).getAllByRole('row').slice(1).map((row) => row.textContent);
  expect(rows).toEqual(['Acme Freight21,500 pts$15.00', 'Blue Line16,400 pts$64.00']);
  expect(within(tables()[1]).getAllByRole('row')).toHaveLength(4);
});

it('filters purchases by sponsor and reloads for a new date range', async () => {
  respond(report);
  render(<SponsorBillingReport />);
  await screen.findByRole('table', { name: 'Billed purchases' });

  fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: '11' } });
  const rows = within(screen.getByRole('table', { name: 'Billed purchases' })).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toHaveTextContent('Blue Line');

  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-31' } });
  fireEvent.click(screen.getByRole('button', { name: 'View report' }));
  await screen.findByRole('table', { name: 'Billed purchases' });
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/reports/sponsor-billing?startDate=2026-10-01&endDate=2026-10-31', { credentials: 'include' });
});

it('says when nothing was purchased', async () => {
  respond({ sponsors: [], purchases: [], totals: { orderCount: 0, pointsRedeemed: 0, amountDue: 0 } });
  render(<SponsorBillingReport />);
  expect(await screen.findByText('No purchases were made in this date range.')).toBeInTheDocument();
  expect(screen.getByText('Total to bill').nextSibling).toHaveTextContent('$0.00');
});

it('shows the server error', async () => {
  respond({ message: 'Choose a valid date range.' }, false);
  render(<SponsorBillingReport />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a valid date range.');
});
