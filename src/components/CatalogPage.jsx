import React, { useEffect, useMemo, useRef, useState } from 'react';

const favoriteStorageKey = (userId) => `driver-catalog-favorites-${userId ?? 'guest'}`;

function readFavorites(userId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(favoriteStorageKey(userId)) || '[]'));
  } catch {
    return new Set();
  }
}

const formatPrice = (price) => Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const formatPoints = (points) => `${Number(points).toLocaleString()} pts`;
const formatOrderDate = (value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const hasRequiredAddress = (address) => Boolean(address
  && address.streetAddress?.trim() && address.city?.trim() && address.zipCode?.trim() && address.country?.trim());
const addressLine = (address) => [address.streetAddress, address.city, address.state, address.zipCode, address.country]
  .map((part) => part?.trim()).filter(Boolean).join(', ');

export default function CatalogPage({ sponsors = [], userId, onOrderPlaced }) {
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
  const [shippingAddress, setShippingAddress] = useState({ streetAddress: '', city: '', state: '', zipCode: '', country: '' });
  const [addressLoading, setAddressLoading] = useState(Boolean(userId));
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [addressMessage, setAddressMessage] = useState('');
  const [savedAddress, setSavedAddress] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(Boolean(userId));
  const [ordersError, setOrdersError] = useState('');
  const [confirmingProductId, setConfirmingProductId] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);
  const placedHeadingRef = useRef(null);

  useEffect(() => {
    if (!sponsors.some((sponsor) => Number(sponsor.id) === Number(activeSponsorId))) {
      setActiveSponsorId(sponsors[0]?.id ?? null);
    }
  }, [activeSponsorId, sponsors]);

  useEffect(() => {
    setFavorites(readFavorites(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetch('/api/driver/shipping-address', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to load your shipping address.');
        return data.address;
      })
      .then((address) => {
        if (!active || !address) return;
        setShippingAddress((current) => ({ ...current, ...address }));
        setSavedAddress(address);
      })
      .catch((requestError) => { if (active) setAddressError(requestError.message); })
      .finally(() => { if (active) setAddressLoading(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetch('/api/orders', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || 'Unable to load your orders.');
        return data;
      })
      .then((data) => { if (active) setOrders(Array.isArray(data?.orders) ? data.orders : []); })
      .catch((requestError) => { if (active) setOrdersError(requestError.message); })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
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
    setPlacedOrder(null);
  }, [activeSponsorId]);

  // The confirmation replaces a taller detail view, so move the driver to it.
  useEffect(() => {
    if (placedOrder) placedHeadingRef.current?.focus();
  }, [placedOrder]);

  useEffect(() => {
    setConfirmingProductId(null);
    setCheckoutError('');
  }, [selectedProductId, activeSponsorId]);

  const updateProduct = (productId, changes) => {
    setProducts((current) => current.map((product) => (
      product.productId === productId ? { ...product, ...changes } : product
    )));
  };

  // The server re-checks price, stock and balance; whatever it reports back is
  // applied here so the page matches what the driver would actually be charged.
  const placeOrder = async (product) => {
    setPlacingOrder(true);
    setCheckoutError('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId: activeSponsorId, productId: product.productId, expectedPointCost: product.pointCost }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === 'PRICE_CHANGED') updateProduct(product.productId, { pointCost: data.pointCost, price: data.price });
        if (data.code === 'OUT_OF_STOCK') updateProduct(product.productId, { stockQuantity: 0 });
        if (data.code === 'INSUFFICIENT_POINTS') setCatalogData((current) => ({ ...current, pointBalance: data.pointBalance }));
        throw new Error(data.message || 'Unable to place this order.');
      }
      setCatalogData((current) => ({ ...current, pointBalance: data.pointBalance }));
      if (data.stockQuantity !== undefined) updateProduct(product.productId, { stockQuantity: data.stockQuantity });
      setOrders((current) => [data.order, ...current]);
      setPlacedOrder({ ...data.order, pointBalance: data.pointBalance, shipsTo: addressLine(savedAddress) });
      setConfirmingProductId(null);
      setSelectedProductId(null);
      onOrderPlaced?.(data.order);
    } catch (requestError) {
      setCheckoutError(requestError.message);
    } finally {
      setPlacingOrder(false);
    }
  };

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

  const saveShippingAddress = async (event) => {
    event.preventDefault();
    setAddressSaving(true);
    setAddressError('');
    setAddressMessage('');
    try {
      const response = await fetch('/api/driver/shipping-address', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shippingAddress),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to save your shipping address.');
      setShippingAddress(data.address);
      setSavedAddress(data.address);
      setAddressMessage('Delivery address saved securely.');
    } catch (requestError) {
      setAddressError(requestError.message);
    } finally {
      setAddressSaving(false);
    }
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
          ) : placedOrder ? (
            <section className="catalog-order-placed" aria-labelledby="order-placed-title">
              <p className="catalog-section__eyebrow">Order #{placedOrder.orderId}</p>
              <h3 id="order-placed-title" ref={placedHeadingRef} tabIndex={-1}>Order placed</h3>
              <p role="status">Your order for {placedOrder.productTitle} is confirmed.</p>
              <dl className="catalog-summary">
                <div><dt>Points spent</dt><dd>{formatPoints(placedOrder.pointCost)}</dd></div>
                <div><dt>New balance</dt><dd>{formatPoints(placedOrder.pointBalance)}</dd></div>
                <div><dt>Ordered on</dt><dd>{formatOrderDate(placedOrder.createdAt)}</dd></div>
                {placedOrder.shipsTo && <div><dt>Ships to</dt><dd>{placedOrder.shipsTo}</dd></div>}
              </dl>
              <button type="button" onClick={() => setPlacedOrder(null)}>Back to catalog</button>
            </section>
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
                    <p className={selectedProduct.stockQuantity === 0 ? 'catalog-stock catalog-stock--empty' : 'catalog-stock'}>
                      {selectedProduct.stockQuantity === null || selectedProduct.stockQuantity === undefined
                        ? 'Stock not set'
                        : selectedProduct.stockQuantity === 0
                          ? 'Out of stock'
                          : `${selectedProduct.stockQuantity} in stock`}
                    </p>
                    {selectedProduct.stockQuantity === 0 && <p className="catalog-stock-warning" role="alert">This item is currently unavailable.</p>}
                    <p className="catalog-detail__description">{selectedProduct.description}</p>
                    {balance !== null && confirmingProductId !== selectedProduct.productId && (
                      <button
                        className="catalog-detail__redeem"
                        type="button"
                        disabled={selectedProduct.stockQuantity === 0}
                        onClick={() => { setCheckoutError(''); setConfirmingProductId(selectedProduct.productId); }}
                      >
                        Redeem for {formatPoints(selectedProduct.pointCost)}
                      </button>
                    )}
                    {balance !== null && confirmingProductId === selectedProduct.productId && (() => {
                      const cost = Number(selectedProduct.pointCost);
                      const shortBy = cost - balance;
                      const outOfStock = selectedProduct.stockQuantity === 0;
                      const addressReady = hasRequiredAddress(savedAddress);
                      return (
                        <div className="catalog-checkout" role="dialog" aria-labelledby="catalog-checkout-title">
                          <h4 id="catalog-checkout-title">Confirm your order</h4>
                          <dl className="catalog-summary">
                            <div><dt>Item</dt><dd>{selectedProduct.title}</dd></div>
                            <div><dt>Cost</dt><dd>{formatPoints(cost)}</dd></div>
                            <div><dt>Current balance</dt><dd>{formatPoints(balance)}</dd></div>
                            <div><dt>Balance after order</dt><dd>{shortBy > 0 ? '—' : formatPoints(balance - cost)}</dd></div>
                            <div><dt>Ships to</dt><dd>{addressReady ? addressLine(savedAddress) : 'No address saved'}</dd></div>
                          </dl>
                          {shortBy > 0 && (
                            <p className="catalog-checkout__error" role="alert">
                              Not enough points. You need {shortBy.toLocaleString()} more points to order this item.
                            </p>
                          )}
                          {!addressReady && (
                            <p className="catalog-checkout__error" role="alert">Save a shipping address below before placing an order.</p>
                          )}
                          {checkoutError && <p className="catalog-checkout__error" role="alert">{checkoutError}</p>}
                          <div className="catalog-checkout__actions">
                            <button
                              type="button"
                              disabled={placingOrder || shortBy > 0 || outOfStock || !addressReady}
                              onClick={() => placeOrder(selectedProduct)}
                            >
                              {placingOrder ? 'Placing order...' : 'Place order'}
                            </button>
                            <button type="button" className="catalog-checkout__cancel" disabled={placingOrder} onClick={() => { setConfirmingProductId(null); setCheckoutError(''); }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })()}
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
                        <p className={product.stockQuantity === 0 ? 'catalog-stock catalog-stock--empty' : 'catalog-stock'}>
                          {product.stockQuantity === null || product.stockQuantity === undefined
                            ? 'Stock not set'
                            : product.stockQuantity === 0
                              ? 'Out of stock'
                              : `${product.stockQuantity} in stock`}
                        </p>
                        {product.stockQuantity === 0 && <p className="catalog-stock-warning" role="status">Currently unavailable</p>}
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

      <section className="catalog-section catalog-delivery" aria-labelledby="delivery-address-title">
        <div className="catalog-section__heading">
          <div>
            <p className="catalog-section__eyebrow">Delivery</p>
            <h2 id="delivery-address-title">Shipping address</h2>
          </div>
        </div>
        <form className="catalog-address-form" onSubmit={saveShippingAddress}>
          {addressLoading ? (
            <p className="catalog-state">Loading your saved address...</p>
          ) : (
            <>
              <label className="catalog-address-form__street">
                Street address
                <input maxLength={255} autoComplete="street-address" required value={shippingAddress.streetAddress} onChange={(event) => setShippingAddress((current) => ({ ...current, streetAddress: event.target.value }))} />
              </label>
              <label>
                City
                <input maxLength={100} autoComplete="address-level2" required value={shippingAddress.city} onChange={(event) => setShippingAddress((current) => ({ ...current, city: event.target.value }))} />
              </label>
              <label>
                State / region
                <input maxLength={100} autoComplete="address-level1" value={shippingAddress.state} onChange={(event) => setShippingAddress((current) => ({ ...current, state: event.target.value }))} />
              </label>
              <label>
                ZIP / postal code
                <input maxLength={20} autoComplete="postal-code" required value={shippingAddress.zipCode} onChange={(event) => setShippingAddress((current) => ({ ...current, zipCode: event.target.value }))} />
              </label>
              <label>
                Country
                <input maxLength={100} autoComplete="country-name" required value={shippingAddress.country} onChange={(event) => setShippingAddress((current) => ({ ...current, country: event.target.value }))} />
              </label>
              <p className="catalog-address-form__privacy">Only you can view and update this saved address.</p>
              <button className="catalog-address-form__save" type="submit" disabled={addressSaving}>
                {addressSaving ? 'Saving...' : 'Save shipping address'}
              </button>
            </>
          )}
          {addressMessage && <p className="catalog-address-form__message" role="status">{addressMessage}</p>}
          {addressError && <p className="catalog-address-form__error" role="alert">{addressError}</p>}
        </form>
      </section>

      <section className="catalog-section catalog-orders" aria-labelledby="order-history-title">
        <div className="catalog-section__heading">
          <div>
            <p className="catalog-section__eyebrow">Your redemptions</p>
            <h2 id="order-history-title">Order history</h2>
          </div>
        </div>
        {ordersLoading ? (
          <p className="catalog-state">Loading your orders...</p>
        ) : ordersError ? (
          <p className="catalog-state" role="alert">{ordersError}</p>
        ) : orders.length === 0 ? (
          <div className="catalog-orders__empty">
            <h3>No orders yet</h3>
            <p>Items you redeem from a sponsor catalog will be listed here.</p>
          </div>
        ) : (
          <table className="catalog-orders__table">
            <caption className="visually-hidden">Your orders, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Order date</th>
                <th scope="col">Item</th>
                <th scope="col">Sponsor</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.orderId}>
                  <td><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
                  <td>{order.productTitle}</td>
                  <td>{order.sponsorName}</td>
                  <td>{formatPoints(order.pointCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
