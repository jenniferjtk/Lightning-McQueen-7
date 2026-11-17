import React, { useEffect, useMemo, useState } from 'react';
import { formatOrderDate, formatPoints, orderStatusLabel } from '../orders.js';

// The orders drivers placed from this sponsor's catalog and the points each
// one removed from the driver's balance (story 23920).
export default function SponsorOrdersPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [driverFilter, setDriverFilter] = useState('all');

  useEffect(() => {
    let active = true;
    fetch('/api/sponsor/orders', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.orders)) throw new Error(data.message || 'Unable to load driver orders.');
        if (active) setOrders(data.orders);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => { active = false; };
  }, []);

  const drivers = useMemo(() => {
    const byId = new Map();
    (orders || []).forEach((order) => byId.set(order.driver.id, order.driver));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const visibleOrders = useMemo(() => (orders || [])
    .filter((order) => driverFilter === 'all' || String(order.driver.id) === driverFilter), [orders, driverFilter]);

  const totals = useMemo(() => visibleOrders.reduce((sum, order) => (order.status === 'canceled'
    ? { ...sum, returned: sum.returned + order.pointCost }
    : { ...sum, spent: sum.spent + order.pointCost, count: sum.count + 1 }), { spent: 0, returned: 0, count: 0 }), [visibleOrders]);

  return (
    <main className="driver-management-page sponsor-orders-page">
      <section className="driver-management-page__intro">
        <p className="driver-management-page__eyebrow">Sponsor tools</p>
        <h1>Driver orders.</h1>
        <p>See what your drivers redeemed from your catalog and the points each order removed from their balance.</p>
      </section>

      {error ? (
        <p className="driver-management-page__message" role="alert">{error}</p>
      ) : orders === null ? (
        <p className="driver-management-page__message">Loading driver orders...</p>
      ) : orders.length === 0 ? (
        <section className="card">
          <h2 className="card__title">No orders yet</h2>
          <p className="driver-management-page__message">When a driver redeems points in your catalog, the order shows up here.</p>
        </section>
      ) : (
        <section className="card" aria-labelledby="sponsor-orders-title">
          <div className="sponsor-orders__header">
            <h2 className="card__title" id="sponsor-orders-title">Orders</h2>
            <label className="sponsor-orders__filter">
              Driver
              <select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
                <option value="all">All drivers</option>
                {drivers.map((driver) => <option key={driver.id} value={String(driver.id)}>{driver.name}</option>)}
              </select>
            </label>
          </div>

          <dl className="sponsor-orders__summary">
            <div><dt>Active orders</dt><dd>{totals.count.toLocaleString()}</dd></div>
            <div><dt>Points removed</dt><dd>{formatPoints(totals.spent)}</dd></div>
            <div><dt>Points returned from cancellations</dt><dd>{formatPoints(totals.returned)}</dd></div>
          </dl>

          <div className="sponsor-orders__table-wrap">
            <table className="catalog-orders__table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Date</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Item</th>
                  <th scope="col">Status</th>
                  <th scope="col">Points removed</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.orderId}>
                    <td>#{order.orderId}</td>
                    <td><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
                    <td>{order.driver.name}</td>
                    <td>{order.productTitle}</td>
                    <td><span className={`catalog-order-status catalog-order-status--${order.status}`}>{orderStatusLabel(order.status)}</span></td>
                    <td>
                      {order.status === 'canceled'
                        ? <span className="sponsor-orders__returned">{formatPoints(order.pointCost)} returned</span>
                        : `−${formatPoints(order.pointCost)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
