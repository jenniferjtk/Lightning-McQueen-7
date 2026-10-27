import React, { useEffect, useMemo, useState } from 'react';

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

const EMPTY_FILTERS = { search: '', category: '', sort: 'featured', affordableOnly: false };

// Items without a point cost (sponsor has no conversion rate) can't be afforded.
const canAfford = (product, balance) => product.pointCost !== null && balance !== null && product.pointCost <= balance;

function PointCost({ product, balance }) {
  if (product.pointCost === null) return <span className="catalog-cost catalog-cost--unavailable">Price unavailable</span>;
  const affordable = canAfford(product, balance);
  return (
    <span className="catalog-cost-group">
      <span className={affordable ? 'catalog-cost' : 'catalog-cost catalog-cost--over'}>
        {product.pointCost.toLocaleString()} pts
      </span>
      {!affordable && balance !== null && (
        <span className="catalog-cost__need">Need {(product.pointCost - balance).toLocaleString()} more</span>
      )}
    </span>
  );
}

function ProductDetail({ product, balance, onBack }) {
  return (
    <article className="catalog-detail" aria-labelledby="catalog-detail-title">
      <button type="button" className="catalog-detail__back" onClick={onBack}>← Back to catalog</button>
      <div className="catalog-detail__body">
        <div className="catalog-detail__image">
          {product.imageUrl ? <img src={product.imageUrl} alt={product.title} /> : <span aria-hidden="true">No image</span>}
        </div>
        <div className="catalog-detail__info">
          <p className="catalog-section__eyebrow">{product.displayCategory}</p>
          <h3 id="catalog-detail-title">{product.title}</h3>
          <PointCost product={product} balance={balance} />
          <p className="catalog-detail__description">{product.description || 'No description is available for this item yet.'}</p>
        </div>
      </div>
    </article>
  );
}

export default function CatalogPage({ sponsors = [] }) {
  const [activeSponsorId, setActiveSponsorId] = useState(sponsors[0]?.id ?? null);
  const [catalog, setCatalog] = useState({ status: 'idle', data: null, error: '' });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedProductId, setSelectedProductId] = useState(null);

  useEffect(() => {
    if (!sponsors.some((sponsor) => sponsor.id === activeSponsorId)) {
      setActiveSponsorId(sponsors[0]?.id ?? null);
    }
  }, [activeSponsorId, sponsors]);

  // Each tab loads only that sponsor's catalog and balance. A response for a
  // sponsor the driver has since switched away from is ignored, so products
  // from two sponsors never mix.
  useEffect(() => {
    if (activeSponsorId === null) return undefined;
    let current = true;
    setCatalog({ status: 'loading', data: null, error: '' });
    setSelectedProductId(null);
    setFilters((previous) => ({ ...previous, category: '' }));
    fetch(`/api/sponsors/${activeSponsorId}/catalog`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to load this catalog.');
        if (current) setCatalog({ status: 'ready', data, error: '' });
      })
      .catch((requestError) => {
        if (current) setCatalog({ status: 'error', data: null, error: requestError.message });
      });
    return () => { current = false; };
  }, [activeSponsorId]);

  const activeSponsor = sponsors.find((sponsor) => sponsor.id === activeSponsorId);
  const products = catalog.data?.products ?? [];
  const balance = catalog.data?.pointBalance ?? null;
  const categories = useMemo(() => [...new Set(products.map((product) => product.displayCategory))].sort(), [products]);

  const visibleProducts = useMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase();
    const filtered = products.filter((product) => (
      (!query || `${product.title} ${product.description}`.toLocaleLowerCase().includes(query))
      && (!filters.category || product.displayCategory === filters.category)
      && (!filters.affordableOnly || canAfford(product, balance))
    ));
    if (filters.sort === 'featured') return filtered;
    const direction = filters.sort === 'price-asc' ? 1 : -1;
    // Items with no price sort last in either direction.
    return [...filtered].sort((left, right) => {
      if (left.pointCost === null || right.pointCost === null) return (left.pointCost === null) - (right.pointCost === null);
      return (left.pointCost - right.pointCost) * direction;
    });
  }, [products, filters, balance]);

  const selectedProduct = products.find((product) => product.productId === selectedProductId);
  const filtersActive = filters.search.trim() || filters.category || filters.affordableOnly;
  const setFilter = (name, value) => setFilters((previous) => ({ ...previous, [name]: value }));

  let panel;
  if (!activeSponsor) {
    panel = (
      <div className="catalog-empty">
        <span className="catalog-empty__mark" aria-hidden="true">★</span>
        <h3>No sponsor catalogs yet</h3>
        <p>Once a sponsor approves your application, their rewards catalog will appear here.</p>
      </div>
    );
  } else if (catalog.status === 'loading' || catalog.status === 'idle') {
    panel = <p className="catalog-message">Loading {activeSponsor.name} rewards...</p>;
  } else if (catalog.status === 'error') {
    panel = <p className="catalog-message catalog-message--error" role="alert">{catalog.error}</p>;
  } else if (selectedProduct) {
    panel = <ProductDetail product={selectedProduct} balance={balance} onBack={() => setSelectedProductId(null)} />;
  } else {
    panel = (
      <>
        <div className="catalog-controls">
          <label>
            Search rewards
            <input type="search" value={filters.search} placeholder="Search by name or description" onChange={(event) => setFilter('search', event.target.value)} />
          </label>
          <label>
            Category
            <select value={filters.category} onChange={(event) => setFilter('category', event.target.value)}>
              <option value="">All categories</option>
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Sort by
            <select value={filters.sort} onChange={(event) => setFilter('sort', event.target.value)}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="catalog-controls__toggle">
            <input type="checkbox" checked={filters.affordableOnly} disabled={balance === null} onChange={(event) => setFilter('affordableOnly', event.target.checked)} />
            Only show items I can afford
          </label>
        </div>

        {products.length === 0 ? (
          <div className="catalog-empty">
            <span className="catalog-empty__mark" aria-hidden="true">{activeSponsor.name.slice(0, 1)}</span>
            <h3>{activeSponsor.name} hasn&apos;t added any rewards yet</h3>
            <p>Check back soon. Rewards your sponsor adds will appear here.</p>
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="catalog-empty" role="status">
            <span className="catalog-empty__mark" aria-hidden="true">?</span>
            <h3>No items match your filters</h3>
            <p>Try a different search or category{filters.affordableOnly ? ', or show items you can\'t afford yet' : ''}.</p>
            <button type="button" className="catalog-empty__action" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>Clear filters</button>
          </div>
        ) : (
          <>
            <p className="catalog-count" aria-live="polite">
              {visibleProducts.length} of {products.length} {products.length === 1 ? 'item' : 'items'}{filtersActive ? ' match' : ''}
            </p>
            <ul className="catalog-grid" aria-label={`${activeSponsor.name} rewards`}>
              {visibleProducts.map((product) => (
                <li key={product.productId} className="catalog-card">
                  <div className="catalog-card__image">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span aria-hidden="true">No image</span>}
                  </div>
                  <p className="catalog-card__category">{product.displayCategory}</p>
                  <h3 className="catalog-card__title">{product.title}</h3>
                  <PointCost product={product} balance={balance} />
                  <button
                    type="button"
                    className="catalog-card__details"
                    aria-label={`View details for ${product.title}`}
                    onClick={() => setSelectedProductId(product.productId)}
                  >
                    View details
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

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
            <h2 id="catalog-title">Sponsor catalog</h2>
          </div>
          {sponsors.length > 1 && (
            <div className="catalog-sponsor-tabs" role="tablist" aria-label="Choose sponsor catalog">
              {sponsors.map((sponsor) => (
                <button
                  key={sponsor.id}
                  id={`catalog-sponsor-tab-${sponsor.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeSponsorId === sponsor.id}
                  aria-controls="catalog-sponsor-panel"
                  className={activeSponsorId === sponsor.id ? 'catalog-sponsor-tabs__tab catalog-sponsor-tabs__tab--active' : 'catalog-sponsor-tabs__tab'}
                  onClick={() => setActiveSponsorId(sponsor.id)}
                >
                  {sponsor.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeSponsor && catalog.status === 'ready' && (
          <div className="catalog-balance" aria-label="Your point balance">
            <span>Your balance with {catalog.data.sponsorName}</span>
            <strong>{balance === null ? '—' : `${balance.toLocaleString()} pts`}</strong>
          </div>
        )}
        {catalog.data?.stale && (
          <p className="catalog-message" role="status">Some reward details may be out of date while the product provider is unavailable.</p>
        )}

        <div
          id="catalog-sponsor-panel"
          className="catalog-panel"
          role={sponsors.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={sponsors.length > 1 ? `catalog-sponsor-tab-${activeSponsorId}` : undefined}
        >
          {panel}
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
