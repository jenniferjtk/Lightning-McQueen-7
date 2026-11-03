// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AccountPage from '../../src/components/AccountPage.jsx';

afterEach(() => cleanup());

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

it('keeps the existing sponsor field when there is at most one sponsor', () => {
  render(<AccountPage user={{ role: 'driver', firstName: 'Dana', lastName: 'Driver', sponsorName: 'Acme Trucking' }} />);

  expect(screen.getByLabelText('Sponsor')).toHaveValue('Acme Trucking');
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});