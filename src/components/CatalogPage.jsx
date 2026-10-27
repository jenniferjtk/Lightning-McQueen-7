import React, { useEffect, useMemo, useState } from 'react';

const favoriteStorageKey = (userId) => `driver-catalog-favorites-${userId ?? 'guest'}`;

function readFavorites(userId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(favoriteStorageKey(userId)) || '[]'));
  } catch {
    return new Set();
  }
}

const formatPrice = (price) => Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function CatalogPage({ sponsors = [], userId }) {
  const [activeSponsorId, setActiveSponsorId] = useState(sponsors[0]?.id ?? null);
  const [products, setProducts] = useState([]);
  const [catalogData, setCatalogData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [sort, setSort] = useState('featured');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [favorites, setFavorites] = useState(() => readFavorites(userId));

  useEffect(() => {
    if (!sponsors.some((sponsor) => Number(sponsor.id) === Number(activeSponsorId))) {
      setActiveSponsorId(sponsors[0]?.id ?? null);
    }
  }, [activeSponsorId, sponsors]);

  useEffect(() => {
    setFavorites(readFavorites(userId));
  }, [userId]);

  useEffect(() => {
    if (!activeSponsorId) {
      setProducts([]);
      setCatalogData(null);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setProducts([]);
    setCatalogData(null);
    setLoading(true);
    setError('');
    fetch(`/api/sponsors/${activeSponsorId}/catalog`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to load this sponsor catalog.');
        return data;
      })
      .then((data) => {
        if (!active) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setCatalogData(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [activeSponsorId]);

  const activeSponsor = sponsors.find((sponsor) => Number(sponsor.id) === Number(activeSponsorId));
  const balance = Number.isFinite(Number(catalogData?.pointBalance)) && catalogData?.pointBalance !== null
    ? Number(catalogData.pointBalance)
    : null;
  const categories = [...new Set(products.map((product) => product.displayCategory || product.category).filter(Boolean))].sort();
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = products.filter((product) => {
      const productCategory = product.displayCategory || product.category;
      const matchesCategory = !category || productCategory === category;
      const searchableText = `${product.title || ''} ${product.description || ''} ${productCategory || ''}`.toLocaleLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      const matchesFavorite = !favoritesOnly || favorites.has(product.productId);
      const matchesBalance = !affordableOnly || balance === null || Number(product.pointCost) <= balance;
      return matchesCategory && matchesSearch && matchesFavorite && matchesBalance;
    });
    if (sort === 'price-asc') filtered.sort((left, right) => Number(left.price) - Number(right.price));
    if (sort === 'price-desc') filtered.sort((left, right) => Number(right.price) - Number(left.price));
    return filtered;
  }, [products, search, category, favoritesOnly, favorites, affordableOnly, balance, sort]);
  const selectedProduct = products.find((product) => product.productId === selectedProductId);

  useEffect(() => {
    setSelectedProductId(null);
  }, [activeSponsorId]);

  const toggleFavorite = (productId) => {
    setFavorites((current) => {
      const updated = new Set(current);
      if (updated.has(productId)) updated.delete(productId);
      else updated.add(productId);
      try {
        localStorage.setItem(favoriteStorageKey(userId), JSON.stringify([...updated]));
      } catch {
        // Keep favorites usable in this view when browser storage is unavailable.
      }
      return updated;
    });
  };

  return (
    <main className="catalog-page">
      <section className="catalog-page__intro">
        <p className="catalog-page__eyebrow">Rewards</p>
        <h1>Catalog</h1>
        <p>Browse rewards available from your sponsors and review your redemption history.</p>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-title">
        <div className="catalog-section__heading">
          <div>
            <p className="catalog-section__eyebrow">Redeem points</p>
            <h2 id="catalog-title">{activeSponsor ? `${activeSponsor.name} catalog` : 'Sponsor catalog'}</h2>
          </div>
          {sponsors.length > 1 && (
            <div className="catalog-sponsor-tabs" role="tablist" aria-label="Choose sponsor catalog">
              {sponsors.map((sponsor) => (
                <button
                  key={sponsor.id}
                  id={`catalog-sponsor-tab-${sponsor.id}`}
                  type="button"
                  role="tab"
                  aria-selected={Number(activeSponsorId) === Number(sponsor.id)}
                  aria-controls="catalog-sponsor-panel"
                  className={Number(activeSponsorId) === Number(sponsor.id) ? 'catalog-sponsor-tabs__tab catalog-sponsor-tabs__tab--active' : 'catalog-sponsor-tabs__tab'}
                  onClick={() => {
                    setActiveSponsorId(sponsor.id);
                    setCategory('');
                    setSearch('');
                    setFavoritesOnly(false);
                    setAffordableOnly(false);
                    setSort('featured');
                  }}
                >
                  {sponsor.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeSponsor && catalogData && (
          <div className="catalog-balance" aria-label="Your point balance">
            <span>Your balance with {catalogData.sponsorName || activeSponsor.name}</span>
            <strong>{balance === null ? '—' : `${balance.toLocaleString()} pts`}</strong>
          </div>
        )}
        {catalogData?.stale && (
          <p className="catalog-message" role="status">Some reward details may be out of date while the product provider is unavailable.</p>
        )}

        <div
          id="catalog-sponsor-panel"
          role={sponsors.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={sponsors.length > 1 ? `catalog-sponsor-tab-${activeSponsorId}` : undefined}
        >
          {activeSponsor && !loading && !error && products.length > 0 && (
            <div className="catalog-controls">
              <label>
                Search products
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by keyword" />
              </label>
              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label>
                Sort by
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price (low to high)</option>
                  <option value="price-desc">Price (high to low)</option>
                </select>
              </label>
              <button
                className={favoritesOnly ? 'catalog-controls__favorites catalog-controls__favorites--active' : 'catalog-controls__favorites'}
                type="button"
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly((current) => !current)}
              >
                {favoritesOnly ? 'Showing favorites' : 'Favorites only'}
              </button>
              {balance !== null && (
                <label className="catalog-controls__toggle">
                  <input
                    type="checkbox"
                    checked={affordableOnly}
                    onChange={(event) => setAffordableOnly(event.target.checked)}
                  />
                  Only show items I can afford
                </label>
              )}
            </div>
          )}

          {loading ? (
            <p className="catalog-state">Loading rewards...</p>
          ) : error ? (
            <p className="catalog-state" role="alert">{error}</p>
          ) : !activeSponsor ? (
            <div className="catalog-empty">
              <span className="catalog-empty__mark" aria-hidden="true">★</span>
              <h3>No sponsor catalogs yet</h3>
              <p>Once a sponsor approves your application, their rewards catalog will appear here.</p>
            </div>
          ) : products.length === 0 ? (
            <p className="catalog-state">{activeSponsor.name} hasn&apos;t added any rewards yet.</p>
          ) : visibleProducts.length === 0 ? (
            <div className="catalog-no-results" role="status">
              <h3>No items match your filters</h3>
              <p>Clear filters or show items you can&apos;t afford yet.</p>
              <button type="button" onClick={() => {
                setSearch('');
                setCategory('');
                setFavoritesOnly(false);
                setAffordableOnly(false);
              }}>Clear filters</button>
            </div>
          ) : (
            selectedProduct ? (
              <article className="catalog-detail" aria-label={selectedProduct.title}>
                <button className="catalog-detail__back" type="button" onClick={() => setSelectedProductId(null)}>← Back to catalog</button>
                <div className="catalog-detail__body">
                  <div className="catalog-detail__image">
                    {selectedProduct.imageUrl && <img src={selectedProduct.imageUrl} alt={selectedProduct.title} />}
                  </div>
                  <div className="catalog-detail__info">
                    <p className="catalog-product__category">{selectedProduct.displayCategory || selectedProduct.category}</p>
                    <h3>{selectedProduct.title}</h3>
                    <p>{formatPrice(selectedProduct.price)}</p>
                    <div className="catalog-cost-group">
                      <span className={balance !== null && Number(selectedProduct.pointCost) > balance ? 'catalog-cost catalog-cost--over' : 'catalog-cost'}>
                        {Number(selectedProduct.pointCost).toLocaleString()} pts
                      </span>
                      {balance !== null && Number(selectedProduct.pointCost) > balance && <span className="catalog-cost__need">Need {(Number(selectedProduct.pointCost) - balance).toLocaleString()} more</span>}
                    </div>
                    <p className="catalog-detail__description">{selectedProduct.description}</p>
                  </div>
                </div>
              </article>
            ) : (
              <>
                <p className="catalog-result-count" aria-live="polite">{visibleProducts.length} of {products.length} items match</p>
                <ul className="catalog-products" aria-label={`${activeSponsor.name} rewards`}>
                  {visibleProducts.map((product) => {
                    const isFavorite = favorites.has(product.productId);
                    const isOverBudget = balance !== null && Number(product.pointCost) > balance;
                    return (
                      <li className="catalog-product" key={product.productId}>
                        <button
                          className={isFavorite ? 'catalog-product__favorite catalog-product__favorite--active' : 'catalog-product__favorite'}
                          type="button"
                          aria-label={isFavorite ? `Remove ${product.title} from favorites` : `Add ${product.title} to favorites`}
                          aria-pressed={isFavorite}
                          onClick={() => toggleFavorite(product.productId)}
                        >
                          <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
                        </button>
                        {product.imageUrl ? <img className="catalog-product__image" src={product.imageUrl} alt={product.title} /> : <div className="catalog-product__image catalog-product__image--empty" aria-hidden="true">★</div>}
                        <p className="catalog-product__category">{product.displayCategory || product.category}</p>
                        <h3>{product.title}</h3>
                        <p className="catalog-product__price">{formatPrice(product.price)}</p>
                        <div className="catalog-cost-group">
                          <span className={isOverBudget ? 'catalog-cost catalog-cost--over' : 'catalog-cost'}>{Number(product.pointCost).toLocaleString()} pts</span>
                          {isOverBudget && <span className="catalog-cost__need">Need {(Number(product.pointCost) - balance).toLocaleString()} more</span>}
                        </div>
                        <button className="catalog-product__details" type="button" aria-label={`View details for ${product.title}`} onClick={() => setSelectedProductId(product.productId)}>View details</button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )
          )}
        </div>
      </section>

      <section className="catalog-section catalog-orders" aria-labelledby="order-history-title">
        <div className="catalog-section__heading">
          <div>
            <p className="catalog-section__eyebrow">Your redemptions</p>
            <h2 id="order-history-title">Order history</h2>
          </div>
        </div>
        <div className="catalog-orders__empty">
          <h3>No orders yet</h3>
          <p>Items you redeem from a sponsor catalog will be listed here.</p>
        </div>
      </section>
    </main>
  );
}
