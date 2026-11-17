// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminSalesReportsPage from '../../src/components/AdminSalesReportsPage.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('filters driver sales by sponsor, date, and detail level', async () => {
  const fetchMock = vi.fn(async (url) => {
    if (url.startsWith('/api/admin/reports/sales/options')) {
      return {
        ok: true,
        json: async () => ({
          sponsors: [{ id: 10, name: 'Sam Sponsor' }],
          drivers: url.includes('sponsorId=10') ? [{ id: 1, name: 'Dana Driver' }] : [],
        }),
      };
    }
    const query = new URLSearchParams(url.split('?')[1]);
    return {
      ok: true,
      json: async () => ({
        entries: query.get('view') === 'detailed' ? [{
          orderId: 5,
          saleDate: '2026-10-12',
          driverName: 'Dana Driver',
          sponsorName: 'Sam Sponsor',
          productTitle: 'Helmet',
          amount: 50,
          pointCost: 100,
          status: 'delivered',
        }] : [],
      }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AdminSalesReportsPage />);

  expect(await screen.findByRole('heading', { name: 'Sales Reports' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Report' }), { target: { value: 'driver' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sponsor' }), { target: { value: '10' } });
  expect(await screen.findByRole('combobox', { name: 'Driver' })).toHaveValue('all');
  fireEvent.change(screen.getByRole('combobox', { name: 'Driver' }), { target: { value: '1' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'View' }), { target: { value: 'detailed' } });
  fireEvent.click(screen.getByRole('button', { name: 'View report' }));

  expect(await screen.findByText('Helmet')).toBeInTheDocument();
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/reportType=driver.*sponsorId=10.*driverId=1.*view=detailed|reportType=driver.*view=detailed.*sponsorId=10.*driverId=1/),
      { credentials: 'include' },
    );
  });
  expect(screen.getAllByText('$50.00')).toHaveLength(2);
});

it('shows a report error instead of crashing on invalid detailed order dates', async () => {
  const fetchMock = vi.fn(async (url) => ({
    ok: true,
    json: async () => url.includes('/options')
      ? { sponsors: [], drivers: [] }
      : { entries: [{ orderId: 1, saleDate: null }] },
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AdminSalesReportsPage />);

  await screen.findByRole('heading', { name: 'Sales Reports' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'View report' })).toBeEnabled());
  fireEvent.change(screen.getByRole('combobox', { name: 'View' }), { target: { value: 'detailed' } });
  fireEvent.click(screen.getByRole('button', { name: 'View report' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('The detailed sales report contains an invalid order date.');
  expect(screen.getByRole('heading', { name: /Sales by Sponsor · Detailed/ })).toBeInTheDocument();
});
