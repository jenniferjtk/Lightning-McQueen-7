// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SponsorDriversPage from '../../src/components/SponsorDriversPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const drivers = [
  { id: 1, firstName: 'Dana', lastName: 'Driver', email: 'dana@example.com', points: 25 },
  { id: 2, firstName: 'Alex', lastName: 'Racer', email: 'alex@example.com', points: 120 },
  { id: 3, firstName: 'Casey', lastName: 'Driver', email: 'casey@example.com', points: 60 },
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

it('reports failures loading sponsor drivers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ message: 'Unable to load sponsor drivers.' }),
  }));
  render(<SponsorDriversPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load sponsor drivers.');
});
