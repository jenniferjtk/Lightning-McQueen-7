import React, { useEffect, useRef, useState } from 'react';
import { formatDeliveryDate, formatPoints, formatPrice } from '../orders.js';

// A sponsor picks one of its approved drivers and redeems a catalog item for
// them with that driver's points (story 25021). The driver must be chosen
// before the order can be placed.
export default function OrderForDriverPanel({ product, onClose, onOrdered }) {
  const [drivers, setDrivers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [driverId, setDriverId] = useState('');
  const [pointCost, setPointCost] = useState(product.pointCost);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState(null);
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
    let active = true;
    fetch('/api/sponsor/order-drivers', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.drivers)) throw new Error(data.message || 'Unable to load your drivers.');
        if (active) setDrivers(data.drivers);
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.message);
      });
    return () => { active = false; };
  }, []);

  const driver = drivers?.find((entry) => String(entry.id) === driverId) || null;
  const canAfford = driver && pointCost !== null && driver.pointBalance >= pointCost;

  const placeOrder = async () => {
    if (!driver) return;
    setPlacing(true);
    setError('');
    try {
      const response = await fetch('/api/sponsor/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ driverId: driver.id, productId: product.productId, expectedPointCost: pointCost }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // A new live price needs a fresh confirmation, so show it and wait.
        if (data.code === 'PRICE_CHANGED' && Number.isSafeInteger(data.pointCost)) setPointCost(data.pointCost);
        if (data.code === 'INSUFFICIENT_POINTS' && Number.isFinite(data.pointBalance)) {
          setDrivers((current) => current.map((entry) => (entry.id === driver.id ? { ...entry, pointBalance: data.pointBalance } : entry)));
        }
        throw new Error(data.message || 'Unable to place this order.');
      }
      setPlaced(data);
      onOrdered?.(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <section className="card order-for-driver" aria-labelledby="order-for-driver-title">
      <div className="order-for-driver__header">
        <div>
          <p className="driver-management-page__eyebrow">Order for a driver</p>
          <h2 className="card__title" id="order-for-driver-title" ref={headingRef} tabIndex={-1}>{product.title}</h2>
          <p className="order-for-driver__price">
            {formatPrice(product.price)} · {pointCost === null ? 'Point value not set' : formatPoints(pointCost)}
          </p>
        </div>
        <button type="button" className="order-for-driver__close" onClick={onClose}>Close</button>
      </div>

      {placed ? (
        <div className="order-for-driver__done" role="status">
          <p>
            <strong>Order #{placed.order.orderId} placed for {placed.driver.name}.</strong>{' '}
            {formatPoints(placed.order.pointCost)} came out of their balance, which is now {formatPoints(placed.pointBalance)}.
          </p>
          {placed.order.estimatedDelivery && <p>Estimated delivery: {formatDeliveryDate(placed.order.estimatedDelivery)}.</p>}
          <button type="button" onClick={onClose}>Done</button>
        </div>
      ) : loadError ? (
        <p className="sponsor-catalog__notice sponsor-catalog__notice--error" role="alert">{loadError}</p>
      ) : drivers === null ? (
        <p className="driver-management-page__message">Loading your drivers...</p>
      ) : drivers.length === 0 ? (
        <p className="driver-management-page__message">You have no approved drivers to order for yet.</p>
      ) : (
        <>
          <label className="order-for-driver__field">
            Driver
            <select value={driverId} onChange={(event) => { setDriverId(event.target.value); setError(''); }}>
              <option value="">Choose a driver</option>
              {drivers.map((entry) => (
                <option key={entry.id} value={String(entry.id)}>
                  {entry.name} ({formatPoints(entry.pointBalance)}){entry.hasShippingAddress ? '' : ' - no shipping address'}
                </option>
              ))}
            </select>
          </label>

          {driver && (
            <dl className="order-for-driver__summary">
              <div><dt>{driver.name}'s balance</dt><dd>{formatPoints(driver.pointBalance)}</dd></div>
              <div><dt>This item</dt><dd>{pointCost === null ? '—' : `−${formatPoints(pointCost)}`}</dd></div>
              <div><dt>Balance after</dt><dd>{canAfford ? formatPoints(driver.pointBalance - pointCost) : '—'}</dd></div>
            </dl>
          )}
          {driver && !driver.hasShippingAddress && (
            <p className="order-for-driver__warning">{driver.name} hasn't saved a shipping address, so this order can't be shipped yet.</p>
          )}
          {driver && driver.hasShippingAddress && pointCost !== null && !canAfford && (
            <p className="order-for-driver__warning">{driver.name} needs {formatPoints(pointCost - driver.pointBalance)} more for this item.</p>
          )}
          {error && <p className="sponsor-catalog__notice sponsor-catalog__notice--error" role="alert">{error}</p>}

          <div className="order-for-driver__actions">
            <button
              type="button"
              onClick={placeOrder}
              disabled={!driver || !driver.hasShippingAddress || !canAfford || placing}
            >
              {placing ? 'Placing order...' : driver ? `Place order for ${driver.name}` : 'Choose a driver first'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
