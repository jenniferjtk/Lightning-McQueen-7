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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
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
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError('');
    setStale(false);
    fetch(`/api/sponsors/${activeSponsorId}/catalog`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to load this sponsor catalog.');
        return data;
      })
      .then((data) => {
        if (!active) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setStale(Boolean(data.stale));
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
  const categories = [...new Set(products.map((product) => product.displayCategory || product.category).filter(Boolean))].sort();
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const productCategory = product.displayCategory || product.category;
      const matchesCategory = !category || productCategory === category;
      const searchableText = `${product.title || ''} ${product.description || ''} ${productCategory || ''}`.toLocaleLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      const matchesFavorite = !favoritesOnly || favorites.has(product.productId);
      return matchesCategory && matchesSearch && matchesFavorite;
    });
  }, [products, search, category, favoritesOnly, favorites]);

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
                  }}
                >
                  {sponsor.name}
                </button>
              ))}
            </div>
          )}
        </div>

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
              <button
                className={favoritesOnly ? 'catalog-controls__favorites catalog-controls__favorites--active' : 'catalog-controls__favorites'}
                type="button"
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly((current) => !current)}
              >
                {favoritesOnly ? 'Showing favorites' : 'Favorites only'}
              </button>
            </div>
          )}

          {stale && <p className="catalog-notice" role="status">Showing saved catalog data; live product information is currently unavailable.</p>}
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
            <p className="catalog-state">This sponsor has no rewards available yet.</p>
          ) : visibleProducts.length === 0 ? (
            <p className="catalog-state">No rewards match your search.</p>
          ) : (
            <div className="catalog-products">
              {visibleProducts.map((product) => {
                const isFavorite = favorites.has(product.productId);
                return (
                  <article className="catalog-product" key={product.productId}>
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
                    <p className="catalog-product__points">{Number(product.pointCost).toLocaleString()} pts</p>
                  </article>
                );
              })}
            </div>
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