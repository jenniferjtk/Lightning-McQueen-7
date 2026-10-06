// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdminDriversPage from '../../src/components/AdminDriversPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(['Driver', 'Sponsor', 'Admin'])('creates a %s using the shared fields', async (label) => {
  const role = label.toLowerCase();
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ drivers: [] }) })
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
  expect(screen.queryByRole('cell', { name: 'new@example.com' }) !== null).toBe(role === 'driver');
});
