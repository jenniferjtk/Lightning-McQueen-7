// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CatalogPage from '../../src/components/CatalogPage.jsx';

const products = [
  { productId: 1, title: 'Monitor', price: 599, pointCost: 599, description: 'Full HD display', category: 'electronics', displayCategory: 'Displays', imageUrl: 'https://img/monitor.png', stockQuantity: 0 },
  { productId: 2, title: 'Hard Drive', price: 64, pointCost: 50, description: 'Stores 2TB', category: 'electronics', displayCategory: 'Cab tech', imageUrl: 'https://img/drive.png', stockQuantity: null },
  { productId: 3, title: 'Backpack', price: 109.95, pointCost: 110, description: 'Carries a laptop', category: "men's clothing", displayCategory: 'On the road', imageUrl: 'https://img/backpack.png', stockQuantity: 12 },
  { productId: 4, title: 'Jacket', price: 49, pointCost: 75, description: 'Weatherproof jacket', category: "men's clothing", displayCategory: 'Clothing', imageUrl: 'https://img/jacket.png', stockQuantity: 2 },
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
  const fetchMock = vi.fn((url, options = {}) => {
    if (url === '/api/driver/shipping-address' && options.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({ address: JSON.parse(options.body) }) });
    }
    if (url === '/api/driver/shipping-address') {
      return Promise.resolve({ ok: true, json: async () => ({ address: {
        streetAddress: '123 Main Street', city: 'Clemson', state: 'SC', zipCode: '29631', country: 'United States',
      } }) });
    }
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

  it('shows exact stock counts, unknown stock, and an out-of-stock warning', async () => {
    stubCatalogApi();
    render(<CatalogPage sponsors={[sponsors[0]]} />);

    await screen.findByRole('list', { name: 'Acme Trucking rewards' });
    expect(within(screen.getByText('Backpack').closest('li')).getByText('12 in stock')).toBeInTheDocument();
    expect(within(screen.getByText('Hard Drive').closest('li')).getByText('Stock not set')).toBeInTheDocument();
    expect(within(screen.getByText('Monitor').closest('li')).getByText('Out of stock')).toBeInTheDocument();
    expect(within(screen.getByText('Monitor').closest('li')).getByRole('status')).toHaveTextContent('Currently unavailable');

    fireEvent.click(screen.getByRole('button', { name: 'View details for Monitor' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This item is currently unavailable.');
  });

  it('loads and securely saves the shipping address from the catalog view', async () => {
    const fetchMock = stubCatalogApi();
    render(<CatalogPage sponsors={[sponsors[0]]} userId={55} />);

    expect(await screen.findByLabelText('Street address')).toHaveValue('123 Main Street');
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '45 Delivery Lane' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save shipping address' }));

    expect(await screen.findByText('Delivery address saved securely.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/driver/shipping-address', expect.objectContaining({
      method: 'PUT',
      credentials: 'include',
      body: expect.stringContaining('45 Delivery Lane'),
    }));
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

describe('CatalogPage checkout', () => {
  afterEach(() => cleanup());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  const placed = {
    orderId: 7, sponsorId: 1, sponsorName: 'Acme Trucking', productId: 2, productTitle: 'Hard Drive',
    unitPrice: 64, pointCost: 50, status: 'pending', createdAt: '2026-11-04T15:30:00.000Z',
  };
  const jsonResponse = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

  // Wraps the catalog stub with the order endpoints. placeOrder answers each POST.
  const stubCheckoutApi = ({ orders = [], placeOrder = () => jsonResponse({ order: placed, pointBalance: 60, stockQuantity: null }, 201), address, catalog } = {}) => {
    const catalogFetch = stubCatalogApi(catalog ? { 1: catalog } : {});
    const fetchMock = vi.fn((url, options = {}) => {
      if (url === '/api/orders' && options.method === 'POST') return placeOrder(JSON.parse(options.body));
      if (url === '/api/orders') return jsonResponse({ orders });
      if (url === '/api/driver/shipping-address' && !options.method && address) return jsonResponse({ address });
      return catalogFetch(url, options);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const openDetails = async (title) => {
    fireEvent.click(await screen.findByRole('button', { name: `View details for ${title}` }));
  };
  const balanceBanner = () => screen.getByLabelText('Your point balance');

  it('asks the driver to confirm, then places the order and shows a confirmation', async () => {
    const fetchMock = stubCheckoutApi();
    const onOrderPlaced = vi.fn();
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} onOrderPlaced={onOrderPlaced} />);
    await openDetails('Hard Drive');

    fireEvent.click(await screen.findByRole('button', { name: 'Redeem for 50 pts' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm your order' });
    expect(within(dialog).getByText('Hard Drive')).toBeInTheDocument();
    expect(within(dialog).getByText('60 pts')).toBeInTheDocument();
    expect(within(dialog).getByText('123 Main Street, Clemson, SC, 29631, United States')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/orders' && options?.method === 'POST')).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Place order' }));

    expect(await screen.findByRole('heading', { name: 'Order placed' })).toHaveFocus();
    const post = fetchMock.mock.calls.find(([url, options]) => url === '/api/orders' && options?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ sponsorId: 1, productId: 2, expectedPointCost: 50 });
    expect(screen.getByText('Order #7')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your order for Hard Drive is confirmed.');
    // The balance drops right away, with no reload.
    expect(within(balanceBanner()).getByText('60 pts')).toBeInTheDocument();
    expect(onOrderPlaced).toHaveBeenCalledWith(placed);
    const history = screen.getByRole('table');
    expect(within(history).getByText('Hard Drive')).toBeInTheDocument();
    expect(within(history).getByText('Nov 4, 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to catalog' }));
    expect(screen.getByRole('list', { name: 'Acme Trucking rewards' })).toBeInTheDocument();
  });

  it('cancels the confirmation without placing an order', async () => {
    const fetchMock = stubCheckoutApi();
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);
    await openDetails('Hard Drive');

    fireEvent.click(await screen.findByRole('button', { name: 'Redeem for 50 pts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('explains how many more points an item needs and blocks the order', async () => {
    stubCheckoutApi({ catalog: { ...catalogs[1], pointBalance: 60 } });
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);
    await openDetails('Backpack');

    fireEvent.click(await screen.findByRole('button', { name: 'Redeem for 110 pts' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Not enough points. You need 50 more points to order this item.');
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });

  it('shows the server\'s insufficient-points error and the real balance', async () => {
    stubCheckoutApi({
      placeOrder: () => jsonResponse({ message: 'You need 20 more points to order this item.', code: 'INSUFFICIENT_POINTS', pointBalance: 30, pointCost: 50 }, 409),
    });
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);
    await openDetails('Hard Drive');

    fireEvent.click(await screen.findByRole('button', { name: 'Redeem for 50 pts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('You need 20 more points to order this item.')).toBeInTheDocument();
    expect(within(balanceBanner()).getByText('30 pts')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Order placed' })).not.toBeInTheDocument();
  });

  it('shows a changed price and confirms again at the new cost', async () => {
    const posts = [];
    stubCheckoutApi({
      placeOrder: (body) => {
        posts.push(body);
        return posts.length === 1
          ? jsonResponse({ message: 'The price changed to 55 points. Review the new cost and confirm again.', code: 'PRICE_CHANGED', pointCost: 55, price: 55 }, 409)
          : jsonResponse({ order: { ...placed, pointCost: 55 }, pointBalance: 55, stockQuantity: null }, 201);
      },
    });
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);
    await openDetails('Hard Drive');

    fireEvent.click(await screen.findByRole('button', { name: 'Redeem for 50 pts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('The price changed to 55 points. Review the new cost and confirm again.')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Confirm your order' });
    expect(within(dialog).getAllByText('55 pts')).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Place order' }));
    await screen.findByRole('heading', { name: 'Order placed' });
    expect(posts.map((body) => body.expectedPointCost)).toEqual([50, 55]);
  });

  it('requires a saved shipping address before ordering', async () => {
    stubCheckoutApi({ address: { streetAddress: '', city: '', state: '', zipCode: '', country: '' } });
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);
    await openDetails('Hard Drive');

    fireEvent.click(await screen.findByRole('button', { name: 'Redeem for 50 pts' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Save a shipping address below before placing an order.');
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });

  it('cannot redeem an out-of-stock item', async () => {
    stubCheckoutApi({ catalog: { ...catalogs[1], pointBalance: 1000 } });
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);
    await openDetails('Monitor');

    expect(await screen.findByRole('button', { name: 'Redeem for 599 pts' })).toBeDisabled();
  });

  it('lists past orders with the date each was placed', async () => {
    stubCheckoutApi({ orders: [placed, { ...placed, orderId: 6, productTitle: 'Backpack', pointCost: 110, createdAt: '2026-10-20T15:00:00.000Z' }] });
    render(<CatalogPage sponsors={[sponsors[0]]} userId={5} />);

    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent))).toEqual([
      ['Nov 4, 2026', 'Hard Drive', 'Acme Trucking', '50 pts'],
      ['Oct 20, 2026', 'Backpack', 'Acme Trucking', '110 pts'],
    ]);
    expect(screen.queryByText('No orders yet')).not.toBeInTheDocument();
  });
});
