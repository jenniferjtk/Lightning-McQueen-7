// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ProfileCard from '../../src/components/ProfileCard.jsx';

afterEach(() => cleanup());

it('shows each sponsor on a separate line when a driver has multiple sponsors', () => {
  render(<ProfileCard
    name="Dana Driver"
    dateJoined="2026-01-01"
    sponsorName="Acme Trucking, Roadrunner Logistics"
    sponsors={[{ id: 10, name: 'Acme Trucking' }, { id: 20, name: 'Roadrunner Logistics' }]}
  />);

  const sponsorRow = screen.getByText('Acme Trucking').closest('dd');
  expect(sponsorRow).toHaveTextContent('Acme Trucking');
  expect(sponsorRow).toHaveTextContent('Roadrunner Logistics');
  expect(sponsorRow.querySelectorAll('span > span')).toHaveLength(2);
});

it('keeps the existing sponsor value for a driver with one sponsor', () => {
  render(<ProfileCard name="Dana Driver" dateJoined="2026-01-01" sponsorName="Acme Trucking" sponsors={[{ id: 10, name: 'Acme Trucking' }]} />);

  expect(screen.getByText('Acme Trucking')).toBeInTheDocument();
  expect(document.querySelector('.profile-card__sponsors')).not.toBeInTheDocument();
});