// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CatalogPage from '../../src/components/CatalogPage.jsx';

const products = [
  { productId: 1, title: 'Monitor', price: 599, pointCost: 599, description: 'Full HD display', category: 'electronics', displayCategory: 'Displays', imageUrl: 'https://img/monitor.png' },
  { productId: 2, title: 'Hard Drive', price: 64, pointCost: 50, description: 'Stores 2TB', category: 'electronics', displayCategory: 'Cab tech', imageUrl: 'https://img/drive.png' },
  { productId: 3, title: 'Backpack', price: 109.95, pointCost: 110, description: 'Carries a laptop', category: "men's clothing", displayCategory: 'On the road', imageUrl: 'https://img/backpack.png' },
  { productId: 4, title: 'Jacket', price: 49, pointCost: 75, description: 'Weatherproof jacket', category: "men's clothing", displayCategory: 'Clothing', imageUrl: 'https://img/jacket.png' },
];

const sponsors = [
  { id: 1, name: 'Acme Trucking' },
  { id: 2, name: 'Roadrunner Logistics' },
];
const backpack = products[2];
const monitor = products[0];
const hardDrive = products[1];
const jacket = products[3];
const bracelet = { productId: 5, title: 'Bracelet', price: 20, pointCost: 20, description: 'A road-trip keepsake', category: 'jewelry', displayCategory: 'Accessories', imageUrl: 'https://img/bracelet.png' };
const catalogs = {
  1: { sponsorId: 1, sponsorName: 'Acme Trucking', pointBalance: 110, products, stale: false },
  2: { sponsorId: 2, sponsorName: 'Roadrunner Logistics', pointBalance: 40, products: [bracelet], stale: false },
};

const stubCatalogApi = (overrides = {}) => {
  const fetchMock = vi.fn((url) => {
    const sponsorId = Number(url.match(/sponsors\/(\d+)\/catalog/)?.[1]);
    const result = overrides[sponsorId] ?? catalogs[sponsorId];
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve({ ok: true, status: 200, json: async () => result });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const cardTitles = () => screen.getByRole('list', { name: /rewards$/ })
  .querySelectorAll('li h3') && [...screen.getByRole('list', { name: /rewards$/ }).querySelectorAll('li h3')]
    .map((heading) => heading.textContent);

describe('CatalogPage', () => {
  afterEach(() => cleanup());

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('switches sponsor catalogs and displays prices and point costs', async () => {
    const fetchMock = stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} userId={5} />);

    await screen.findByRole('list', { name: 'Acme Trucking rewards' });
    expect(screen.getByText('$109.95')).toBeInTheDocument();
    expect(within(screen.getByText('Backpack').closest('li')).getByText('110 pts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));

    expect(await screen.findByRole('list', { name: 'Roadrunner Logistics rewards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Order history' })).toBeInTheDocument();
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sponsors/2/catalog', { credentials: 'include' }));
  });

  it('filters catalog products by category and keyword', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={[sponsors[0]]} />);

    const backpack = await screen.findByRole('heading', { name: 'Backpack' });
    expect(backpack).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Cab tech' } });
    expect(screen.getByRole('heading', { name: 'Hard Drive' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Backpack' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'laptop' } });
    expect(screen.getByRole('heading', { name: 'Backpack' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hard Drive' })).not.toBeInTheDocument();
  });

  it('saves favorites and can show only favorited catalog items', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);

    await screen.findByRole('heading', { name: 'Backpack' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Backpack to favorites' }));
    expect(screen.getByRole('button', { name: 'Remove Backpack from favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('driver-catalog-favorites-5'))).toEqual([backpack.productId]);

    fireEvent.click(screen.getByRole('button', { name: 'Favorites only' }));
    expect(screen.getByRole('heading', { name: 'Backpack' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hard Drive' })).not.toBeInTheDocument();
  });

  it('ignores a slow response from a sponsor the driver already switched away from', async () => {
    let releaseAcme;
    vi.stubGlobal('fetch', vi.fn((url) => (url.endsWith('/1/catalog')
      ? new Promise((resolve) => { releaseAcme = () => resolve({ ok: true, status: 200, json: async () => catalogs[1] }); })
      : Promise.resolve({ ok: true, status: 200, json: async () => ({ ...catalogs[2], products: [bracelet] }) }))));
    render(<CatalogPage sponsors={sponsors} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));
    await screen.findByRole('list', { name: 'Roadrunner Logistics rewards' });
    releaseAcme();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cardTitles()).toEqual([bracelet.title]);
    expect(screen.queryByText(monitor.title)).not.toBeInTheDocument();
  });

  it('marks which items are affordable using the selected sponsor balance', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    const backpackCard = screen.getByText(backpack.title).closest('li');
    expect(within(backpackCard).getByText('110 pts')).not.toHaveClass('catalog-cost--over');
    expect(within(backpackCard).queryByText(/Need/)).not.toBeInTheDocument();

    const monitorCard = screen.getByText(monitor.title).closest('li');
    expect(within(monitorCard).getByText('599 pts')).toHaveClass('catalog-cost--over');
    expect(within(monitorCard).getByText('Need 489 more')).toBeInTheDocument();
  });

  it('combines the affordable filter with search and category', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.click(screen.getByLabelText('Only show items I can afford'));
    expect(cardTitles()).toEqual([hardDrive.title, backpack.title, jacket.title]);
    expect(screen.getByText('3 of 4 items match')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Cab tech' } });
    expect(cardTitles()).toEqual([hardDrive.title]);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'JACKET' } });
    expect(cardTitles()).toEqual([jacket.title]);
  });

  it('shows an empty-filter state and can clear all filters', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'Full HD' } });
    fireEvent.click(screen.getByLabelText('Only show items I can afford'));

    const message = screen.getByRole('status');
    expect(within(message).getByRole('heading', { name: 'No items match your filters' })).toBeInTheDocument();
    expect(message).toHaveTextContent("or show items you can't afford yet");
    expect(screen.queryByRole('list', { name: /rewards$/ })).not.toBeInTheDocument();

    fireEvent.click(within(message).getByRole('button', { name: 'Clear filters' }));
    expect(cardTitles()).toHaveLength(4);
    expect(screen.getByLabelText('Search products')).toHaveValue('');
    expect(screen.getByLabelText('Only show items I can afford')).not.toBeChecked();
  });

  it('sorts items by price in either direction and restores featured order', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price-asc' } });
    expect(cardTitles()).toEqual([jacket.title, hardDrive.title, backpack.title, monitor.title]);
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price-desc' } });
    expect(cardTitles()).toEqual([monitor.title, backpack.title, hardDrive.title, jacket.title]);
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'featured' } });
    expect(cardTitles()).toEqual(products.map((product) => product.title));
  });

  it('opens a product detail view with image, description, sponsor balance, and point cost', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.click(screen.getByRole('button', { name: `View details for ${backpack.title}` }));
    const detail = screen.getByRole('article', { name: backpack.title });
    expect(within(detail).getByRole('img', { name: backpack.title })).toHaveAttribute('src', backpack.imageUrl);
    expect(within(detail).getByText(backpack.description)).toBeInTheDocument();
    expect(within(detail).getByText('On the road')).toBeInTheDocument();
    expect(within(detail).getByText('110 pts')).not.toHaveClass('catalog-cost--over');
    expect(screen.getByLabelText('Your point balance')).toHaveTextContent('110 pts');

    fireEvent.click(within(detail).getByRole('button', { name: '← Back to catalog' }));
    expect(cardTitles()).toHaveLength(4);
  });

  it('shows the over-budget indicator in product details', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);
    await screen.findByRole('list', { name: 'Acme Trucking rewards' });

    fireEvent.click(screen.getByRole('button', { name: `View details for ${monitor.title}` }));
    const detail = screen.getByRole('article', { name: monitor.title });
    expect(within(detail).getByText('599 pts')).toHaveClass('catalog-cost--over');
    expect(within(detail).getByText('Need 489 more')).toBeInTheDocument();
  });

  it('explains empty, unavailable, and stale sponsor catalogs', async () => {
    stubCatalogApi({ 1: { ...catalogs[1], products: [] }, 2: new Error('The product catalog is unavailable right now. Please try again in a few minutes.') });
    render(<CatalogPage sponsors={sponsors} />);

    expect(await screen.findByText("Acme Trucking hasn't added any rewards yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The product catalog is unavailable right now.');

    cleanup();
    stubCatalogApi({ 1: { ...catalogs[1], stale: true } });
    render(<CatalogPage sponsors={[sponsors[0]]} />);
    expect(await screen.findByText(/may be out of date/)).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows the no-sponsor state without sponsor tabs', () => {
    const fetchMock = stubCatalogApi();
    render(<CatalogPage sponsors={[]} />);

    expect(screen.getByText('No sponsor catalogs yet')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
