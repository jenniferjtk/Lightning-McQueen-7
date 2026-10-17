// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SponsorDriversPage from '../../src/components/SponsorDriversPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const drivers = [
  { id: 1, firstName: 'Dana', lastName: 'Driver', email: 'dana@example.com', points: 25, sponsorName: 'Roadrunner Logistics', status: 'approved', submittedAt: '2026-10-01T12:00:00Z', decidedAt: '2026-10-02T12:00:00Z' },
  { id: 2, firstName: 'Alex', lastName: 'Racer', email: 'alex@example.com', points: 120, sponsorName: 'Roadrunner Logistics', status: 'approved', submittedAt: '2026-10-03T12:00:00Z', decidedAt: '2026-10-04T12:00:00Z' },
  { id: 3, firstName: 'Casey', lastName: 'Driver', email: 'casey@example.com', points: 60, sponsorName: 'Roadrunner Logistics', status: 'approved', submittedAt: '2026-10-05T12:00:00Z', decidedAt: '2026-10-06T12:00:00Z' },
];

it('loads sponsor drivers, searches by full name, and sorts by name or points', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sponsorLinked: true, drivers }),
  }));
  render(<SponsorDriversPage />);

  const table = await screen.findByRole('table');
  expect(within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].textContent))
    .toEqual(['Alex Racer', 'Casey Driver', 'Dana Driver']);
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name-desc' } });
  expect(within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].textContent))
    .toEqual(['Dana Driver', 'Casey Driver', 'Alex Racer']);

  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: 'alex RAC' } });
  expect(within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].textContent))
    .toEqual(['Alex Racer']);
  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: '' } });

  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'points-desc' } });
  expect(within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].textContent))
    .toEqual(['Alex Racer', 'Casey Driver', 'Dana Driver']);
  expect(within(table).getByRole('cell', { name: '120' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'points-asc' } });
  expect(within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].textContent))
    .toEqual(['Dana Driver', 'Casey Driver', 'Alex Racer']);
});

it('shows an empty state when the search finds no drivers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sponsorLinked: true, drivers }),
  }));
  render(<SponsorDriversPage />);

  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Search drivers'), { target: { value: 'unknown' } });
  expect(screen.getByText('No drivers match your search.')).toBeInTheDocument();
});

it('opens and closes a read-only application view for an individual driver', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sponsorLinked: true, drivers }),
  }));
  render(<SponsorDriversPage />);

  const table = await screen.findByRole('table');
  fireEvent.click(within(table).getAllByRole('button', { name: 'View application' })[0]);

  const application = screen.getByRole('region', { name: 'Driver application' });
  expect(within(application).getByRole('heading', { name: 'Alex Racer' })).toBeInTheDocument();
  expect(application).toHaveTextContent('Roadrunner Logistics');
  expect(application).toHaveTextContent('approved');
  expect(application).toHaveTextContent('Oct 3, 2026');
  expect(application).toHaveTextContent('Oct 4, 2026');

  fireEvent.click(within(application).getByRole('button', { name: 'Close application' }));
  expect(screen.queryByRole('region', { name: 'Driver application' })).not.toBeInTheDocument();
});

it('loads this sponsor’s point rules and updates a driver balance after an adjustment', async () => {
  const rules = [
    { rule_id: 7, sponsor_id: 10, pt_value: 20, description: 'Safe driving bonus' },
    { rule_id: 8, sponsor_id: 11, pt_value: 500, description: 'Another sponsor rule' },
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
    if (url === '/api/sponsor-rules') {
      return { ok: true, json: async () => ({ rules }) };
    }
    if (url === '/api/points/apply') {
      return { ok: true, json: async () => ({ change_amount: 20, reason: 'Safe driving bonus' }) };
    }
    return { ok: true, json: async () => ({ sponsorLinked: true, drivers }) };
  }));
  render(<SponsorDriversPage user={{ sponsorId: 10 }} />);

  const table = await screen.findByRole('table');
  fireEvent.click(within(table).getAllByRole('button', { name: 'View application' })[0]);

  fireEvent.change(await screen.findByLabelText('Point rule'), { target: { value: '7' } });
  expect(screen.queryByRole('option', { name: 'Another sponsor rule (+500 pts)' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(await screen.findByRole('status')).toHaveTextContent('+20 pts for Safe driving bonus');
  expect(within(screen.getByRole('region', { name: 'Driver application' })).getByText('140')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('/api/points/apply', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ driverUserId: 2, ruleId: 7, comment: '' }),
  }));
});

it('reports failures loading sponsor drivers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ message: 'Unable to load sponsor drivers.' }),
  }));
  render(<SponsorDriversPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load sponsor drivers.');
});

it('keeps rendering when the sponsor API response does not include point balances', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      sponsorLinked: true,
      drivers: [{ id: 1, firstName: 'Dana', lastName: 'Driver', email: 'dana@example.com' }],
    }),
  }));
  render(<SponsorDriversPage />);

  const table = await screen.findByRole('table');
  expect(within(table).getByRole('cell', { name: 'Dana Driver' })).toBeInTheDocument();
  expect(within(table).getByRole('cell', { name: '0' })).toBeInTheDocument();
});

it('shows an error instead of crashing when the API response has no driver list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sponsorLinked: true }),
  }));
  render(<SponsorDriversPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load drivers.');
});
