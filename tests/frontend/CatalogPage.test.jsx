// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CatalogPage from '../../src/components/CatalogPage.jsx';

describe('CatalogPage', () => {
  afterEach(() => cleanup());

  it('switches between sponsor catalogs and shows order history', () => {
    render(<CatalogPage sponsors={[
      { id: 1, name: 'Acme Trucking' },
      { id: 2, name: 'Roadrunner Logistics' },
    ]} />);

    expect(screen.getByRole('heading', { name: 'Acme Trucking rewards' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));

    expect(screen.getByRole('heading', { name: 'Roadrunner Logistics rewards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Order history' })).toBeInTheDocument();
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });

  it('shows the no-sponsor state without sponsor tabs', () => {
    render(<CatalogPage sponsors={[]} />);

    expect(screen.getByText('No sponsor catalogs yet')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});