// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AccountPage from '../../src/components/AccountPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('lists all sponsors in a driver account when there is more than one', () => {
  render(<AccountPage
    user={{ role: 'driver', firstName: 'Dana', lastName: 'Driver' }}
    sponsors={[{ id: 10, name: 'Acme Trucking' }, { id: 20, name: 'Roadrunner Logistics' }]}
  />);

  expect(screen.getByText('Sponsors')).toBeInTheDocument();
  expect(screen.getByRole('list')).toHaveTextContent('Acme Trucking');
  expect(screen.getByRole('list')).toHaveTextContent('Roadrunner Logistics');
  expect(screen.queryByLabelText('Sponsor')).not.toBeInTheDocument();
});

it('shows the dashboard balance and approved sponsor on the driver account page', async () => {
  render(<AccountPage
    user={{ id: 5, role: 'driver', firstName: 'Dana', lastName: 'Driver' }}
    sponsors={[{ id: 10, name: 'Acme Trucking' }]}
    points={275}
  />);

  expect(screen.getByLabelText('Sponsor')).toHaveValue('Acme Trucking');
  fireEvent.click(screen.getByRole('tab', { name: 'Points' }));
  expect(screen.getByLabelText('Points balance')).toHaveTextContent('275 pts');
});

it('keeps the existing sponsor field when there is at most one sponsor', () => {
  render(<AccountPage
    user={{ role: 'driver', firstName: 'Dana', lastName: 'Driver' }}
    sponsors={[{ id: 10, name: 'Acme Trucking' }]}
  />);

  expect(screen.getByLabelText('Sponsor')).toHaveValue('Acme Trucking');
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('loads and saves the same persistent shipping address used in Catalog', async () => {
  const address = { streetAddress: '123 Main Street', city: 'Clemson', state: 'SC', zipCode: '29631', country: 'United States' };
  const fetchMock = vi.fn(async (_url, options = {}) => ({
    ok: true,
    json: async () => options.method === 'PUT' ? { address: JSON.parse(options.body) } : { address },
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AccountPage user={{ id: 5, role: 'driver', firstName: 'Dana', lastName: 'Driver' }} />);

  fireEvent.click(screen.getByRole('tab', { name: 'Shipping address' }));
  expect(await screen.findByLabelText('Street address')).toHaveValue('123 Main Street');
  fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '45 Delivery Lane' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save shipping address' }));

  expect(await screen.findByText('Shipping address saved. It will be used in the Catalog too.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/driver/shipping-address', expect.objectContaining({
    method: 'PUT',
    credentials: 'include',
    body: expect.stringContaining('45 Delivery Lane'),
  }));
});
it('saves the name, email, and phone to the server before saying it was updated', async () => {
  const saved = { firstName: 'Samantha', lastName: 'Sponsor', email: 'sam@example.com', phone: '(864) 555-0100' };
  const fetchMock = vi.fn(async (url, options = {}) => ({
    ok: true,
    json: async () => (url === '/api/account' && options.method === 'PUT'
      ? { account: saved }
      : url === '/api/account'
        ? { account: { firstName: 'Sam', lastName: 'Sponsor', email: 'sam@example.com', phone: '' } }
        : { sponsorLinked: true, drivers: [] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  const onProfileUpdate = vi.fn();
  // Like App, hand the saved user back to the page so it re-renders with it.
  function Harness() {
    const [user, setUser] = useState({ id: 2, role: 'sponsor', firstName: 'Sam', lastName: 'Sponsor', email: 'sam@example.com' });
    return <AccountPage user={user} onProfileUpdate={(updated) => { onProfileUpdate(updated); setUser(updated); }} />;
  }
  render(<Harness />);

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account', { credentials: 'include' }));
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Samantha' } });
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '(864) 555-0100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Account updated.');
  const put = fetchMock.mock.calls.find(([url, options]) => url === '/api/account' && options?.method === 'PUT');
  expect(JSON.parse(put[1].body)).toEqual(saved);
  expect(onProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Samantha', phone: '(864) 555-0100' }));
  expect(screen.getByLabelText('Phone number')).toHaveValue('(864) 555-0100');
});

it('shows the server error and does not claim the account was updated', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => (url === '/api/account' && options.method === 'PUT'
    ? { ok: false, json: async () => ({ message: 'Another account already uses that email address.' }) }
    : { ok: true, json: async () => ({ account: { firstName: 'Dana', lastName: 'Driver', email: 'dana@example.com', phone: '' } }) })));
  const onProfileUpdate = vi.fn();
  render(<AccountPage user={{ id: 5, role: 'driver', firstName: 'Dana', lastName: 'Driver' }} onProfileUpdate={onProfileUpdate} readOnly={false} />);

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'taken@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }));

  expect(await screen.findByText('Another account already uses that email address.')).toBeInTheDocument();
  expect(screen.queryByText('Account updated.')).not.toBeInTheDocument();
  expect(onProfileUpdate).not.toHaveBeenCalled();
});
