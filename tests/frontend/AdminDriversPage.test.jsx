// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import AdminDriversPage from '../../src/components/AdminDriversPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('edits, resets passwords, and deletes sponsors through the sponsor routes', async () => {
  const sponsor = { id: 2, firstName: 'Sam', lastName: 'Sponsor', email: 'sam@example.com' };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, options) => ({
    ok: true,
    json: async () => url.endsWith('/sponsor-links/2') ? { message: 'Sponsor account link saved.' }
      : options?.method === 'PUT' ? { sponsor: { ...sponsor, firstName: 'Updated' } }
      : url.endsWith('/drivers') ? { drivers: [] }
        : url.endsWith('/sponsor-links') ? { sponsors: [], sponsorUsers: [{ user_id: 2, sponsor_id: null }] }
          : { sponsors: [sponsor] },
  })));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<AdminDriversPage />);
  await screen.findByRole('cell', { name: 'Sam Sponsor' });
  const list = within(screen.getByRole('region', { name: 'Sponsors' }));
  fireEvent.click(list.getByRole('button', { name: 'Edit' }));
  fireEvent.change(list.getByLabelText('First name'), { target: { value: 'Updated' } });
  fireEvent.click(list.getByRole('button', { name: 'Save' }));
  await screen.findByRole('cell', { name: 'Updated Sponsor' });
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/sponsors/2', expect.objectContaining({ method: 'PUT' }));
  fireEvent.click(list.getByRole('button', { name: 'Reset password' }));
  fireEvent.change(list.getByLabelText('New password'), { target: { value: 'new-password' } });
  fireEvent.change(list.getByLabelText('Confirm password'), { target: { value: 'new-password' } });
  fireEvent.click(list.getByRole('button', { name: 'Reset password' }));
  await screen.findByText('Password reset for Updated Sponsor.');
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/sponsors/2/password', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ password: 'new-password' }) }));
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(list.getByRole('button', { name: 'Delete' }));
  expect(list.getByRole('cell', { name: 'Updated Sponsor' })).toBeInTheDocument();
  fireEvent.click(list.getByRole('button', { name: 'Delete' }));
  await screen.findByText('Sponsor account deleted.');
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/sponsors/2', expect.objectContaining({ method: 'DELETE' }));
  expect(list.queryByRole('cell', { name: 'Updated Sponsor' })).not.toBeInTheDocument();
});

it.each(['Driver', 'Sponsor', 'Admin'])('creates a %s using the shared fields', async (label) => {
  const role = label.toLowerCase();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, options) => ({
    ok: true,
    json: async () => options?.method === 'POST'
      ? { user: { id: 5, firstName: 'New', lastName: 'User', email: 'new@example.com', role } }
      : url.endsWith('/drivers') ? { drivers: [] }
        : url.endsWith('/sponsor-links') ? { sponsors: [], sponsorUsers: [] }
          : { sponsors: [] },
  })));
  render(<AdminDriversPage />);
  await screen.findByText('No driver accounts match your search.');
  for (const [name, value] of [['First name', 'New'], ['Last name', 'User'], ['Email address', 'new@example.com'], ['Temporary password', 'test-password']]) {
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: `Create ${label} User` }));
  expect(await screen.findByRole('status')).toHaveTextContent(`${label} account created.`);
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/users', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ firstName: 'New', lastName: 'User', email: 'new@example.com', password: 'test-password', role }),
  }));
  const driverSection = within(screen.getByRole('region', { name: 'Drivers' }));
  const sponsorSection = within(screen.getByRole('region', { name: 'Sponsors' }));
  expect(driverSection.getByText(role === 'driver' ? '1' : '0', { selector: '.admin-account-count' })).toBeInTheDocument();
  expect(sponsorSection.getByText(role === 'sponsor' ? '1' : '0', { selector: '.admin-account-count' })).toBeInTheDocument();
  expect(driverSection.queryByRole('cell', { name: 'new@example.com' }) !== null).toBe(role === 'driver');
  expect(sponsorSection.queryByRole('cell', { name: 'new@example.com' }) !== null).toBe(role === 'sponsor');
});

it('shows driver and sponsor affiliations on the same page', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => ({
    ok: true,
    json: async () => url.endsWith('/drivers')
      ? { drivers: [{ id: 1, firstName: 'Dana', lastName: 'Driver', email: 'driver@example.com', affiliation: 'Acme Trucking, Roadrunner Logistics', sponsorId: 11 }] }
      : url.endsWith('/sponsor-links')
        ? { sponsors: [{ sponsor_id: 10, name: 'Acme Trucking' }, { sponsor_id: 11, name: 'Roadrunner Logistics' }], sponsorUsers: [{ user_id: 2, sponsor_id: 10 }] }
        : { sponsors: [{ id: 2, firstName: 'Sam', lastName: 'Sponsor', email: 'sponsor@example.com', createdAt: '2026-10-05', affiliation: 'Acme Trucking' }] },
  })));
  render(<AdminDriversPage />);
  expect(await screen.findByLabelText('Sponsor affiliation for Dana Driver')).toHaveValue('11');
  expect(await screen.findByRole('cell', { name: 'Sam Sponsor' })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Sponsors' })).getByLabelText('Organization for Sam Sponsor')).toHaveValue('10');
  expect(within(screen.getByRole('region', { name: 'Drivers' })).getByText('1', { selector: '.admin-account-count' })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Sponsors' })).getByText('1', { selector: '.admin-account-count' })).toBeInTheDocument();
});

it('updates a driver sponsor affiliation when the dropdown changes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, options) => ({
    ok: true,
    json: async () => url.endsWith('/drivers')
      ? { drivers: [{ id: 1, firstName: 'Dana', lastName: 'Driver', email: 'driver@example.com', sponsorId: 10 }] }
      : url.endsWith('/sponsor-links')
        ? { sponsors: [{ sponsor_id: 10, name: 'Acme Trucking' }, { sponsor_id: 11, name: 'Roadrunner Logistics' }], sponsorUsers: [] }
        : url.endsWith('/sponsors') ? { sponsors: [] }
          : { message: 'Driver sponsor affiliation saved.', sponsorId: '11' },
  })));
  render(<AdminDriversPage />);
  const select = await screen.findByLabelText('Sponsor affiliation for Dana Driver');
  await screen.findByRole('option', { name: 'Roadrunner Logistics' });
  fireEvent.change(select, { target: { value: '11' } });
  await screen.findByText('Driver sponsor affiliation saved.');
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/drivers/1/affiliation', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ sponsorId: '11' }),
  }));
  expect(select).toHaveValue('11');
});

it('updates a sponsor organization when its dropdown changes without a save button', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, options) => ({
    ok: true,
    json: async () => url.endsWith('/drivers') ? { drivers: [] }
      : url.endsWith('/sponsor-links/2')
        ? { message: 'Sponsor account link saved.' }
        : url.endsWith('/sponsor-links')
          ? { sponsors: [{ sponsor_id: 10, name: 'Acme Trucking' }, { sponsor_id: 11, name: 'Roadrunner Logistics' }], sponsorUsers: [{ user_id: 2, sponsor_id: 10 }] }
          : { sponsors: [{ id: 2, firstName: 'Sam', lastName: 'Sponsor', email: 'sponsor@example.com', affiliation: 'Acme Trucking' }] },
  })));
  render(<AdminDriversPage />);
  const sponsorSection = within(screen.getByRole('region', { name: 'Sponsors' }));
  const select = await sponsorSection.findByLabelText('Organization for Sam Sponsor');
  await screen.findByRole('option', { name: 'Roadrunner Logistics' });
  fireEvent.change(select, { target: { value: '11' } });
  await screen.findByText('Sponsor account link saved.');
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/sponsor-links/2', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ sponsorId: '11' }),
  }));
  expect(sponsorSection.queryByRole('button', { name: 'Save link' })).not.toBeInTheDocument();
});
