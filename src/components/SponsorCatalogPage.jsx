import React, { useCallback, useEffect, useState } from 'react';

async function readJson(response, fallbackMessage) {
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || fallbackMessage);
  return data;
}

const formatPrice = (price) => Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function SponsorCatalogPage({ user }) {
  const sponsorId = user?.sponsorId;
  const catalogUrl = `/api/sponsors/${sponsorId}/catalog`;

  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [tagDrafts, setTagDrafts] = useState({});

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [stale, setStale] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const [busyProductId, setBusyProductId] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const loadCatalog = useCallback(() => {
    if (!sponsorId) return Promise.resolve();
    return fetch(catalogUrl, { credentials: 'include' })
      .then((response) => readJson(response, 'Unable to load your catalog.'))
      .then((data) => {
        setCatalog(data.products);
        setTagDrafts(Object.fromEntries(data.products.map((product) => [product.productId, product.categoryTag || ''])));
        setCatalogError('');
      })
      .catch((requestError) => setCatalogError(requestError.message))
      .finally(() => setCatalogLoading(false));
  }, [catalogUrl, sponsorId]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Short debounce so typing in the search box doesn't send a request per key.
  useEffect(() => {
    if (!sponsorId) return undefined;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      const query = params.toString();
      fetch(`/api/catalog/products${query ? `?${query}` : ''}`, { credentials: 'include' })
        .then((response) => readJson(response, 'Unable to load products.'))
        .then((data) => {
          setProducts(data.products);
          if (!category && !search.trim()) setCategories(data.categories);
          setStale(Boolean(data.stale));
          setProductsError('');
        })
        .catch((requestError) => setProductsError(requestError.message))
        .finally(() => setProductsLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [sponsorId, search, category]);

  const runAction = async (productId, request, successMessage) => {
    setBusyProductId(productId);
    setActionMessage('');
    setActionError('');
    try {
      await request();
      setActionMessage(successMessage);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusyProductId(null);
    }
  };

  const addProduct = (product) => runAction(product.productId, async () => {
    await readJson(await fetch(catalogUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ productId: product.productId }),
    }), 'Unable to add the product.');
    setProducts((current) => current.map((item) => (item.productId === product.productId ? { ...item, inCatalog: true } : item)));
    await loadCatalog();
  }, `Added "${product.title}" to your catalog.`);

  const removeProduct = (product) => runAction(product.productId, async () => {
    await readJson(await fetch(`${catalogUrl}/${product.productId}`, {
      method: 'DELETE',
      credentials: 'include',
    }), 'Unable to remove the product.');
    setCatalog((current) => current.filter((item) => item.productId !== product.productId));
    setProducts((current) => current.map((item) => (item.productId === product.productId ? { ...item, inCatalog: false } : item)));
  }, `Removed "${product.title}" from your catalog.`);

  const saveTag = (product) => runAction(product.productId, async () => {
    const data = await readJson(await fetch(`${catalogUrl}/${product.productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ categoryTag: tagDrafts[product.productId] ?? '' }),
    }), 'Unable to save the category tag.');
    setCatalog((current) => current.map((item) => (
      item.productId === product.productId
        ? { ...item, categoryTag: data.categoryTag, displayCategory: data.categoryTag || item.category }
        : item
    )));
    setTagDrafts((current) => ({ ...current, [product.productId]: data.categoryTag || '' }));
  }, `Saved the category tag for "${product.title}".`);

  return (
    <main className="driver-management-page sponsor-catalog-page">
      <section className="driver-management-page__intro">
        <p className="driver-management-page__eyebrow">Sponsor tools</p>
        <h1>Product catalog.</h1>
        <p>Choose which products your drivers can redeem points for. Drivers only see the products you add here.</p>
      </section>

      {!sponsorId ? (
        <p className="driver-management-page__message" role="status">Your account is not linked to a sponsor organization.</p>
      ) : (
        <>
          {actionMessage && <p className="sponsor-catalog__notice" role="status">{actionMessage}</p>}
          {actionError && <p className="sponsor-catalog__notice sponsor-catalog__notice--error" role="alert">{actionError}</p>}

          <section className="card driver-management" aria-labelledby="sponsor-catalog-heading">
            <h2 id="sponsor-catalog-heading" className="card__title">Your catalog</h2>
            {catalogLoading ? (
              <p className="driver-management-page__message">Loading your catalog...</p>
            ) : catalogError ? (
              <p className="driver-management-page__message" role="alert">{catalogError}</p>
            ) : catalog.length === 0 ? (
              <p className="driver-management-page__message">Your catalog is empty. Add products from the list below.</p>
            ) : (
              <div className="driver-management__table-wrap">
                <table className="driver-management__table sponsor-catalog__table" aria-label="Your catalog">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Price</th>
                      <th scope="col">Category tag</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((product) => (
                      <tr key={product.productId}>
                        <td>
                          <span className="sponsor-catalog__product">
                            {product.imageUrl && <img src={product.imageUrl} alt="" />}
                            {product.title}
                          </span>
                        </td>
                        <td>{formatPrice(product.price)}</td>
                        <td>
                          <span className="sponsor-catalog__tag">
                            <input
                              aria-label={`Category tag for ${product.title}`}
                              value={tagDrafts[product.productId] ?? ''}
                              placeholder={product.category}
                              maxLength={100}
                              onChange={(event) => setTagDrafts((current) => ({ ...current, [product.productId]: event.target.value }))}
                            />
                            <button
                              type="button"
                              disabled={busyProductId === product.productId || (tagDrafts[product.productId] ?? '') === (product.categoryTag || '')}
                              onClick={() => saveTag(product)}
                            >
                              Save
                            </button>
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="driver-management__view-application"
                            disabled={busyProductId === product.productId}
                            onClick={() => removeProduct(product)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card driver-management sponsor-catalog__browse" aria-labelledby="sponsor-catalog-browse-heading">
            <h2 id="sponsor-catalog-browse-heading" className="card__title">Available products</h2>
            {stale && (
              <p className="sponsor-catalog__notice" role="status">
                The product provider can&apos;t be reached, so this list may be out of date.
              </p>
            )}
            <div className="driver-management__controls">
              <label>
                Search products
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or description" />
              </label>
              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            </div>

            {productsLoading ? (
              <p className="driver-management-page__message">Loading products...</p>
            ) : productsError ? (
              <p className="driver-management-page__message" role="alert">{productsError}</p>
            ) : products.length === 0 ? (
              <p className="driver-management-page__message">No products match your search.</p>
            ) : (
              <div className="driver-management__table-wrap">
                <table className="driver-management__table sponsor-catalog__table" aria-label="Available products">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Category</th>
                      <th scope="col">Price</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.productId}>
                        <td>
                          <span className="sponsor-catalog__product">
                            {product.imageUrl && <img src={product.imageUrl} alt="" />}
                            {product.title}
                          </span>
                        </td>
                        <td>{product.category}</td>
                        <td>{formatPrice(product.price)}</td>
                        <td>
                          {product.inCatalog ? (
                            <span className="sponsor-catalog__in-catalog">In your catalog</span>
                          ) : (
                            <button
                              type="button"
                              className="driver-management__view-application"
                              disabled={busyProductId === product.productId}
                              onClick={() => addProduct(product)}
                            >
                              Add to catalog
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
