// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SponsorCatalogPage from '../../src/components/SponsorCatalogPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const user = { id: 2, role: 'sponsor', sponsorId: 10 };
const backpack = { productId: 1, title: 'Backpack', price: 109.95, category: "men's clothing", imageUrl: null };
const drive = { productId: 9, title: 'Hard Drive', price: 64, category: 'electronics', imageUrl: null };

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// Routes each request by method and URL; the catalog and product list start
// from the given state and respond to adds and removes.
function stubApi({ catalog = [], products = [backpack, drive], stale = false, failAdd } = {}) {
  let current = [...catalog];
  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    if (url === '/api/sponsors/10/catalog' && method === 'GET') {
      return json({ products: current.map((product) => ({ ...product, categoryTag: null, displayCategory: product.category })) });
    }
    if (url.startsWith('/api/catalog/products')) {
      const ids = new Set(current.map((product) => product.productId));
      return json({ products: products.map((product) => ({ ...product, inCatalog: ids.has(product.productId) })), categories: ['electronics', "men's clothing"], stale });
    }
    if (url === '/api/sponsors/10/catalog' && method === 'POST') {
      if (failAdd) return json({ message: failAdd }, 409);
      const { productId } = JSON.parse(options.body);
      current = [...current, products.find((product) => product.productId === productId)];
      return json({ product: {} }, 201);
    }
    if (url.startsWith('/api/sponsors/10/catalog/') && method === 'DELETE') {
      const productId = Number(url.split('/').pop());
      current = current.filter((product) => product.productId !== productId);
      return { ok: true, status: 204, json: async () => ({}) };
    }
    if (url.startsWith('/api/sponsors/10/catalog/') && method === 'PATCH') {
      return json({ productId: Number(url.split('/').pop()), categoryTag: JSON.parse(options.body).categoryTag.trim() || null });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('adds an available product to the sponsor catalog', async () => {
  const fetchMock = stubApi();
  render(<SponsorCatalogPage user={user} />);

  expect(await screen.findByText(/Your catalog is empty/)).toBeInTheDocument();
  const available = await screen.findByRole('table', { name: 'Available products' });
  const driveRow = within(available).getByText('Hard Drive').closest('tr');
  fireEvent.click(within(driveRow).getByRole('button', { name: 'Add to catalog' }));

  const catalogTable = await screen.findByRole('table', { name: 'Your catalog' });
  expect(within(catalogTable).getByText('Hard Drive')).toBeInTheDocument();
  expect(within(driveRow).getByText('In your catalog')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Added "Hard Drive" to your catalog.');
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(post[1].body)).toEqual({ productId: 9 });
});

it('removes a product and lets it be added again', async () => {
  stubApi({ catalog: [backpack] });
  render(<SponsorCatalogPage user={user} />);

  const catalogTable = await screen.findByRole('table', { name: 'Your catalog' });
  await screen.findByRole('table', { name: 'Available products' });
  fireEvent.click(within(catalogTable).getByRole('button', { name: 'Remove' }));

  expect(await screen.findByText(/Your catalog is empty/)).toBeInTheDocument();
  const available = screen.getByRole('table', { name: 'Available products' });
  const backpackRow = within(available).getByText('Backpack').closest('tr');
  expect(within(backpackRow).getByRole('button', { name: 'Add to catalog' })).toBeInTheDocument();
});

it('saves a category tag for a catalog product', async () => {
  const fetchMock = stubApi({ catalog: [drive] });
  render(<SponsorCatalogPage user={user} />);

  const tagInput = await screen.findByLabelText('Category tag for Hard Drive');
  const row = tagInput.closest('tr');
  expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(tagInput, { target: { value: 'Tech gear' } });
  fireEvent.click(within(row).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved the category tag for "Hard Drive".'));
  const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(patch[0]).toBe('/api/sponsors/10/catalog/9');
  expect(JSON.parse(patch[1].body)).toEqual({ categoryTag: 'Tech gear' });
});

it('shows the server message when an add fails', async () => {
  stubApi({ failAdd: 'That product is already in your catalog.' });
  render(<SponsorCatalogPage user={user} />);

  const available = await screen.findByRole('table', { name: 'Available products' });
  fireEvent.click(within(available).getAllByRole('button', { name: 'Add to catalog' })[0]);

  expect(await screen.findByRole('alert')).toHaveTextContent('That product is already in your catalog.');
});

it('warns when the product list is served from a stale cache', async () => {
  stubApi({ stale: true });
  render(<SponsorCatalogPage user={user} />);

  expect(await screen.findByText(/may be out of date/)).toBeInTheDocument();
});

it('shows the provider-unavailable message instead of a product list', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => (url.startsWith('/api/catalog/products')
    ? json({ message: 'The product catalog is unavailable right now. Please try again in a few minutes.', code: 'CATALOG_UNAVAILABLE' }, 502)
    : json({ products: [] }))));
  render(<SponsorCatalogPage user={user} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('The product catalog is unavailable right now.');
});

it('explains when the sponsor account has no organization', () => {
  const fetchMock = stubApi();
  render(<SponsorCatalogPage user={{ ...user, sponsorId: null }} />);

  expect(screen.getByRole('status')).toHaveTextContent('not linked to a sponsor organization');
  expect(fetchMock).not.toHaveBeenCalled();
});
