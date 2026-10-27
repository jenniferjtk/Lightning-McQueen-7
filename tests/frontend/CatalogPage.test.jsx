// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CatalogPage from '../../src/components/CatalogPage.jsx';

const products = [
  { productId: 1, title: 'Backpack', price: 109.95, pointCost: 10995, description: 'Carries a laptop', category: "men's clothing", displayCategory: 'Bags', imageUrl: null },
  { productId: 9, title: 'Hard Drive', price: 64, pointCost: 6400, description: 'Stores 2TB', category: 'electronics', displayCategory: 'electronics', imageUrl: null },
];

const stubCatalogApi = () => {
  const fetchMock = vi.fn(async (url) => ({
    ok: true,
    json: async () => ({ sponsorName: url.includes('/10/') ? 'Acme Trucking' : 'Roadrunner Logistics', products, stale: false }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('CatalogPage', () => {
  afterEach(() => cleanup());

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('switches sponsor catalogs and displays prices and point costs', async () => {
    const fetchMock = stubCatalogApi();
    render(<CatalogPage sponsors={[
      { id: 10, name: 'Acme Trucking' },
      { id: 20, name: 'Roadrunner Logistics' },
    ]} userId={5} />);

    expect(await screen.findByRole('heading', { name: 'Acme Trucking catalog' })).toBeInTheDocument();
    expect(screen.getByText('$109.95')).toBeInTheDocument();
    expect(screen.getByText('10,995 pts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));

    expect(await screen.findByRole('heading', { name: 'Roadrunner Logistics catalog' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Order history' })).toBeInTheDocument();
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sponsors/20/catalog', { credentials: 'include' }));
  });

  it('filters catalog products by category and keyword', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={[{ id: 10, name: 'Acme Trucking' }]} />);

    const backpack = await screen.findByRole('heading', { name: 'Backpack' });
    expect(backpack).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'electronics' } });
    expect(screen.getByRole('heading', { name: 'Hard Drive' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Backpack' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'laptop' } });
    expect(screen.getByRole('heading', { name: 'Backpack' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hard Drive' })).not.toBeInTheDocument();
  });

  it('saves favorites and can show only favorited catalog items', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={[{ id: 10, name: 'Acme Trucking' }]} userId={5} />);

    await screen.findByRole('heading', { name: 'Backpack' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Backpack to favorites' }));
    expect(screen.getByRole('button', { name: 'Remove Backpack from favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('driver-catalog-favorites-5'))).toEqual([1]);

    fireEvent.click(screen.getByRole('button', { name: 'Favorites only' }));
    expect(screen.getByRole('heading', { name: 'Backpack' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hard Drive' })).not.toBeInTheDocument();
  });

  it('shows the no-sponsor state without sponsor tabs', () => {
    render(<CatalogPage sponsors={[]} />);

    expect(screen.getByText('No sponsor catalogs yet')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});