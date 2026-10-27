// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CatalogPage from '../../src/components/CatalogPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const sponsors = [
  { id: 1, name: 'Acme Trucking' },
  { id: 2, name: 'Roadrunner Logistics' },
];

// Real Fake Store products, priced in points as the catalog API returns them.
const backpack = {
  productId: 1,
  title: 'Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops',
  price: 109.95,
  description: 'Your perfect pack for everyday use and walks in the forest. Stash your laptop (up to 15 inches) in the padded sleeve, your everyday',
  category: "men's clothing",
  displayCategory: 'On the road',
  imageUrl: 'https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_t.png',
  pointCost: 110,
};
const jacket = { productId: 3, title: 'Mens Cotton Jacket', price: 55.99, description: 'Great outerwear jacket for Spring, Autumn, Winter.', category: "men's clothing", displayCategory: "men's clothing", imageUrl: null, pointCost: 56 };
const hardDrive = { productId: 9, title: 'WD 2TB Elements Portable External Hard Drive - USB 3.0', price: 64, description: 'USB 3.0 and USB 2.0 compatibility.', category: 'electronics', displayCategory: 'Cab tech', imageUrl: null, pointCost: 64 };
const monitor = { productId: 13, title: 'Acer SB220Q bi 21.5 inches Full HD (1920 x 1080) IPS Ultra-Thin', price: 599, description: '21.5 inches Full HD widescreen IPS display.', category: 'electronics', displayCategory: 'Cab tech', imageUrl: null, pointCost: 599 };
const bracelet = { productId: 5, title: "John Hardy Women's Legends Naga Gold & Silver Dragon Station Chain Bracelet", price: 695, description: 'From our Legends Collection.', category: 'jewelery', displayCategory: 'Milestone rewards', imageUrl: null, pointCost: 869 };

const catalogs = {
  1: { sponsorId: 1, sponsorName: 'Acme Trucking', pointConversionRate: 1, pointBalance: 110, products: [monitor, hardDrive, backpack, jacket], stale: false },
  2: { sponsorId: 2, sponsorName: 'Roadrunner Logistics', pointConversionRate: 0.8, pointBalance: 900, products: [bracelet], stale: false },
};

function stubCatalogApi(overrides = {}) {
  const fetchMock = vi.fn(async (url) => {
    const id = Number(url.match(/\/api\/sponsors\/(\d+)\/catalog$/)?.[1]);
    const body = overrides[id] ?? catalogs[id];
    if (body instanceof Error) return { ok: false, status: 502, json: async () => ({ message: body.message }) };
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const cardTitles = () => within(screen.getByRole('list', { name: /rewards$/ }))
  .getAllByRole('heading', { level: 3 })
  .map((heading) => heading.textContent);

describe('driver catalog', () => {
  it('loads only the selected sponsor\'s catalog and balance for each tab', async () => {
    const fetchMock = stubCatalogApi();
    render(<CatalogPage sponsors={sponsors} />);

    expect(await screen.findByRole('list', { name: 'Acme Trucking rewards' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your point balance')).toHaveTextContent('Your balance with Acme Trucking110 pts');
    expect(cardTitles()).toHaveLength(4);

    fireEvent.click(screen.getByRole('tab', { name: 'Roadrunner Logistics' }));

    expect(await screen.findByRole('list', { name: 'Roadrunner Logistics rewards' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your point balance')).toHaveTextContent('Your balance with Roadrunner Logistics900 pts');
    expect(cardTitles()).toEqual([bracelet.title]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/sponsors/1/catalog', '/api/sponsors/2/catalog']);
    expect(screen.getByRole('heading', { name: 'Order history' })).toBeInTheDocument();
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
