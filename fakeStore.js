// Server-side client for the Fake Store API, the catalog's product source.
// The frontend never calls this provider directly; it reads our own
// /api/... catalog routes, which read the cached_products table.
//
// Every function here resolves to products in our own shape (mapProduct) or
// throws a CatalogProviderError, so swapping providers later means replacing
// this file and keeping the same exports.
//
// Fake Store's CDN (Cloudflare) answers requests from AWS with 403, so the
// deployed Lambda can't reach it. When the provider refuses us that way, the
// functions below answer from fakeStoreSnapshot.js, a committed copy of its
// static product list. Other failures (timeouts, 5xx, bad data) still throw.

import SNAPSHOT from './fakeStoreSnapshot.js';

const BASE_URL = process.env.FAKESTORE_BASE_URL || 'https://fakestoreapi.com';
const TIMEOUT_MS = 5000;

export class CatalogProviderError extends Error {
  constructor(message, { status = null, cause } = {}) {
    super(message, { cause });
    this.name = 'CatalogProviderError';
    this.status = status;
  }
}

// The fields the catalog tables and routes use. Anything the provider
// returns beyond these (e.g. Fake Store's rating) is dropped.
export const mapProduct = (raw) => {
  const id = Number(raw?.id);
  const price = Number(raw?.price);
  if (!Number.isSafeInteger(id) || id < 1 || typeof raw.title !== 'string' || !Number.isFinite(price)) {
    throw new CatalogProviderError('The catalog provider returned a product in an unexpected format.');
  }
  return {
    productId: id,
    title: raw.title,
    price: Math.round(price * 100) / 100,
    description: typeof raw.description === 'string' ? raw.description : '',
    category: typeof raw.category === 'string' ? raw.category : '',
    imageUrl: typeof raw.image === 'string' ? raw.image : null,
  };
};

// Fetches a path and returns its parsed JSON body, or null when the body is
// empty. Network failures, timeouts, non-2xx statuses, and invalid JSON all
// become CatalogProviderError.
async function getJson(path) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new CatalogProviderError('The catalog provider could not be reached.', { cause: error });
  }
  if (!response.ok) {
    // Logged so CloudWatch shows whether a refusal came from the provider's
    // CDN (Cloudflare sets cf-mitigated on challenges) or the provider itself.
    const body = await response.text().catch(() => '');
    console.warn('Catalog provider refused request', JSON.stringify({
      path,
      status: response.status,
      server: response.headers.get('server'),
      cfRay: response.headers.get('cf-ray'),
      cfMitigated: response.headers.get('cf-mitigated'),
      body: body.slice(0, 200),
    }));
    throw new CatalogProviderError(`The catalog provider responded with status ${response.status}.`, { status: response.status });
  }
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CatalogProviderError('The catalog provider returned invalid JSON.', { cause: error });
  }
}

const isRefusal = (error) => error instanceof CatalogProviderError && error.status === 403;

// Calls getJson, answering from the snapshot instead when the provider
// refuses the request.
async function getJsonOrSnapshot(path, fromSnapshot) {
  try {
    return await getJson(path);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    console.warn(`Catalog provider refused ${path}; serving the bundled snapshot.`);
    return fromSnapshot();
  }
}

export async function fetchProducts() {
  const body = await getJsonOrSnapshot('/products', () => SNAPSHOT);
  if (!Array.isArray(body)) throw new CatalogProviderError('The catalog provider returned an unexpected product list.');
  return body.map(mapProduct);
}

// Resolves to null when the product doesn't exist. Fake Store answers an
// unknown id with 200 and an empty body rather than a 404.
export async function fetchProduct(productId) {
  try {
    const body = await getJsonOrSnapshot(
      `/products/${encodeURIComponent(productId)}`,
      () => SNAPSHOT.find((product) => product.id === Number(productId)) ?? null,
    );
    return body ? mapProduct(body) : null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function fetchCategories() {
  const body = await getJsonOrSnapshot(
    '/products/categories',
    () => [...new Set(SNAPSHOT.map((product) => product.category))],
  );
  if (!Array.isArray(body) || !body.every((category) => typeof category === 'string')) {
    throw new CatalogProviderError('The catalog provider returned an unexpected category list.');
  }
  return body;
}
