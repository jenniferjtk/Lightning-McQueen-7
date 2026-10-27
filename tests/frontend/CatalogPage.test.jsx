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

  it('ignores a slow response from a sponsor the driver already switched away from', async () => {
    let releaseAcme;
    vi.stubGlobal('fetch', vi.fn((url) => (url.endsWith('/1/catalog')
      ? new Promise((resolve) => { releaseAcme = () => resolve({ ok: true, status: 200, json: async () => catalogs[1] }); })
      : Promise.resolve({ ok: true, status: 200, json: async () => catalogs[2] }))));
    render(<CatalogPage sponsors={sponsors} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));
    await screen.findByRole('list', { name: 'Roadrunner Logistics rewards' });
    releaseAcme();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cardTitles()).toEqual([bracelet.title]);
    expect(screen.queryByText(monitor.title)).not.toBeInTheDocument();
  });

  it('marks which items the driver can afford with this sponsor\'s points', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    // Balance is 110: the backpack costs exactly 110, the monitor 599.
    const backpackCard = screen.getByText(backpack.title).closest('li');
    expect(within(backpackCard).getByText('110 pts')).not.toHaveClass('catalog-cost--over');
    expect(within(backpackCard).queryByText(/Need/)).not.toBeInTheDocument();

    const monitorCard = screen.getByText(monitor.title).closest('li');
    expect(within(monitorCard).getByText('599 pts')).toHaveClass('catalog-cost--over');
    expect(within(monitorCard).getByText('Need 489 more')).toBeInTheDocument();
  });

  it('filters to affordable items and combines that with search and category', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.click(screen.getByLabelText('Only show items I can afford'));
    expect(cardTitles()).toEqual([hardDrive.title, backpack.title, jacket.title]);
    expect(screen.getByText('3 of 4 items match')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Cab tech' } });
    expect(cardTitles()).toEqual([hardDrive.title]);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search rewards'), { target: { value: 'JACKET' } });
    expect(cardTitles()).toEqual([jacket.title]);
  });

  it('shows a no-results message for an impossible filter combination, and clears it', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    // Only the monitor matches "Full HD", and it costs more than the 110-point balance.
    fireEvent.change(screen.getByLabelText('Search rewards'), { target: { value: 'Full HD' } });
    fireEvent.click(screen.getByLabelText('Only show items I can afford'));

    const message = screen.getByRole('status');
    expect(within(message).getByRole('heading', { name: 'No items match your filters' })).toBeInTheDocument();
    expect(message).toHaveTextContent("or show items you can't afford yet");
    expect(screen.queryByRole('list', { name: /rewards$/ })).not.toBeInTheDocument();

    fireEvent.click(within(message).getByRole('button', { name: 'Clear filters' }));
    expect(cardTitles()).toHaveLength(4);
    expect(screen.getByLabelText('Search rewards')).toHaveValue('');
    expect(screen.getByLabelText('Only show items I can afford')).not.toBeChecked();
  });

  it('sorts by price in both directions', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price-asc' } });
    expect(cardTitles()).toEqual([jacket.title, hardDrive.title, backpack.title, monitor.title]);

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price-desc' } });
    expect(cardTitles()).toEqual([monitor.title, backpack.title, hardDrive.title, jacket.title]);

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'featured' } });
    expect(cardTitles()).toEqual([monitor.title, hardDrive.title, backpack.title, jacket.title]);
  });

  it('opens a product detail view with a large image, full description, and cost', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.click(screen.getByRole('button', { name: `View details for ${backpack.title}` }));

    const detail = screen.getByRole('article', { name: backpack.title });
    expect(within(detail).getByRole('img', { name: backpack.title })).toHaveAttribute('src', backpack.imageUrl);
    expect(within(detail).getByText(backpack.description)).toBeInTheDocument();
    expect(within(detail).getByText('On the road')).toBeInTheDocument();
    expect(within(detail).getByText('110 pts')).not.toHaveClass('catalog-cost--over');
    // The balance stays visible on the detail view.
    expect(screen.getByLabelText('Your point balance')).toHaveTextContent('110 pts');

    fireEvent.click(within(detail).getByRole('button', { name: '← Back to catalog' }));
    expect(cardTitles()).toHaveLength(4);
  });

  it('shows the over-budget indicator on the detail view too', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.click(screen.getByRole('button', { name: `View details for ${monitor.title}` }));

    const detail = screen.getByRole('article', { name: monitor.title });
    expect(within(detail).getByText('599 pts')).toHaveClass('catalog-cost--over');
    expect(within(detail).getByText('Need 489 more')).toBeInTheDocument();
  });

  it('explains when a sponsor has no rewards yet, when the catalog is unavailable, or when it is stale', async () => {
    stubCatalogApi({
      1: { ...catalogs[1], products: [] },
      2: new Error('The product catalog is unavailable right now. Please try again in a few minutes.'),
    });
    render(<CatalogPage sponsors={sponsors} />);

    expect(await screen.findByRole('heading', { name: "Acme Trucking hasn't added any rewards yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The product catalog is unavailable right now.');

    cleanup();
    stubCatalogApi({ 1: { ...catalogs[1], stale: true } });
    render(<CatalogPage sponsors={[sponsors[0]]} />);
    expect(await screen.findByText(/may be out of date/)).toBeInTheDocument();
    // A single sponsor needs no tabs.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows the no-sponsor state without tabs or requests', () => {
    const fetchMock = stubCatalogApi();
    render(<CatalogPage sponsors={[]} />);

    expect(screen.getByText('No sponsor catalogs yet')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
