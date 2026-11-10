// @vitest-environment jsdom
import React from 'react';
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