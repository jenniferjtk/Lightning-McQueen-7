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
    json: async () => options?.method === 'PUT' ? { sponsor: { ...sponsor, firstName: 'Updated' } }
      : url.endsWith('/drivers') ? { drivers: [] } : { sponsors: [sponsor] },
  })));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<AdminDriversPage />);
  await screen.findByRole('cell', { name: 'Sam Sponsor' });
  const list = within(screen.getByRole('region', { name: 'All sponsor users' }));
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
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ drivers: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ sponsors: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 5, firstName: 'New', lastName: 'User', email: 'new@example.com', role } }) }));
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
  expect(within(screen.getByRole('region', { name: 'All drivers' })).queryByRole('cell', { name: 'new@example.com' }) !== null).toBe(role === 'driver');
  expect(within(screen.getByRole('region', { name: 'All sponsor users' })).queryByRole('cell', { name: 'new@example.com' }) !== null).toBe(role === 'sponsor');
});

it('loads sponsor users and searches them independently from drivers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => ({
    ok: true,
    json: async () => url.endsWith('/drivers')
      ? { drivers: [{ id: 1, firstName: 'Dana', lastName: 'Driver', email: 'driver@example.com' }] }
      : { sponsors: [{ id: 2, firstName: 'Sam', lastName: 'Sponsor', email: 'sponsor@example.com', createdAt: '2026-10-05' }] },
  })));
  render(<AdminDriversPage />);
  expect(await screen.findByRole('cell', { name: 'Sam Sponsor' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search sponsor users'), { target: { value: 'missing' } });
  expect(screen.getByText('No sponsor accounts match your search.')).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Dana Driver' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search sponsor users'), { target: { value: ' SAM ' } });
  expect(screen.getByRole('cell', { name: 'Sam Sponsor' })).toBeInTheDocument();
});
