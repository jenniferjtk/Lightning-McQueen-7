import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogProviderError, fetchCategories, fetchProduct, fetchProducts, mapProduct } from '../../fakeStore.js';

afterEach(() => vi.unstubAllGlobals());

const rawProduct = {
  id: 1,
  title: 'Fjallraven Backpack',
  price: 109.95,
  description: 'Fits 15 inch laptops.',
  category: "men's clothing",
  image: 'https://fakestoreapi.com/img/backpack.png',
  rating: { rate: 3.9, count: 120 },
};

const respondWith = (body, status = 200) => vi.fn().mockResolvedValue(
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
);

describe('Fake Store client', () => {
  it('fetches and maps the full product list', async () => {
    const fetchMock = respondWith([rawProduct]);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProducts()).resolves.toEqual([{
      productId: 1,
      title: 'Fjallraven Backpack',
      price: 109.95,
      description: 'Fits 15 inch laptops.',
      category: "men's clothing",
      imageUrl: 'https://fakestoreapi.com/img/backpack.png',
    }]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://fakestoreapi.com/products');
  });

  it('fetches a single product by id', async () => {
    const fetchMock = respondWith(rawProduct);
    vi.stubGlobal('fetch', fetchMock);

    const product = await fetchProduct(1);

    expect(product.productId).toBe(1);
    expect(product).not.toHaveProperty('rating');
    expect(fetchMock.mock.calls[0][0]).toBe('https://fakestoreapi.com/products/1');
  });

  it('treats an empty 200 response (how Fake Store answers unknown ids) as not found', async () => {
    vi.stubGlobal('fetch', respondWith(''));
    await expect(fetchProduct(999)).resolves.toBeNull();
  });

  it('treats a 404 as not found', async () => {
    vi.stubGlobal('fetch', respondWith({ message: 'nope' }, 404));
    await expect(fetchProduct(999)).resolves.toBeNull();
  });

  it('fetches the category list', async () => {
    const fetchMock = respondWith(['electronics', 'jewelery']);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCategories()).resolves.toEqual(['electronics', 'jewelery']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://fakestoreapi.com/products/categories');
  });

  it('wraps an unreachable provider in a CatalogProviderError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(fetchProducts()).rejects.toBeInstanceOf(CatalogProviderError);
  });

  it('wraps a provider server error in a CatalogProviderError with its status', async () => {
    vi.stubGlobal('fetch', respondWith('Internal Server Error', 500));
    await expect(fetchProducts()).rejects.toMatchObject({ name: 'CatalogProviderError', status: 500 });
  });

  it('rejects malformed provider data instead of passing it through', async () => {
    vi.stubGlobal('fetch', respondWith('<html>maintenance</html>'));
    await expect(fetchProducts()).rejects.toBeInstanceOf(CatalogProviderError);
    expect(() => mapProduct({ id: 'x', title: 'Bad', price: 1 })).toThrow(CatalogProviderError);
  });
});
