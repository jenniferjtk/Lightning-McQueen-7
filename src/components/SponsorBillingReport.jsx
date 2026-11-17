import React, { useEffect, useMemo, useState } from 'react';
import { formatOrderDate, formatPoints, formatPrice, orderStatusLabel } from '../orders.js';

const dateInputValue = (date) => {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Billing usually runs by calendar month, so default to this month so far.
const defaultDateRange = () => {
  const today = new Date();
  return { startDate: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: dateInputValue(today) };
};

const formatDay = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const csvCell = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

// Admin report of what each sponsor owes for its drivers' purchases
// (story 21122). Canceled orders are left out.
export default function SponsorBillingReport() {
  const initialRange = useMemo(defaultDateRange, []);
  const [filters, setFilters] = useState(initialRange);
  const [range, setRange] = useState(initialRange);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sponsorFilter, setSponsorFilter] = useState('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams(range).toString();
    fetch(`/api/admin/reports/sponsor-billing?${query}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.sponsors)) throw new Error(data.message || 'Unable to build the sponsor billing report.');
        if (active) {
          setReport(data);
          setSponsorFilter('all');
        }
      })
      .catch((requestError) => {
        if (active) {
          setReport(null);
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [range]);

  const purchases = useMemo(() => (report?.purchases || [])
    .filter((purchase) => sponsorFilter === 'all' || String(purchase.sponsorId) === sponsorFilter), [report, sponsorFilter]);

  const downloadCsv = () => {
    const headers = ['Sponsor', 'Order', 'Order date', 'Driver', 'Item', 'Status', 'Points', 'Amount (USD)'];
    const rows = purchases.map((purchase) => [
      purchase.sponsorName, purchase.orderId, formatOrderDate(purchase.createdAt), purchase.driverName,
      purchase.productTitle, orderStatusLabel(purchase.status), purchase.pointCost, purchase.unitPrice.toFixed(2),
    ]);
    const shown = sponsorFilter === 'all' ? report.sponsors : report.sponsors.filter((entry) => String(entry.sponsorId) === sponsorFilter);
    const totals = shown.map((entry) => [`${entry.sponsorName} total`, '', '', '', '', '', entry.pointsRedeemed, entry.amountDue.toFixed(2)]);
    const csv = [headers, ...rows, [], ...totals].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sponsor-billing-${range.startDate}-to-${range.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="reports-panel" aria-labelledby="billing-report-title">
      <div className="reports-panel__heading">
        <div>
          <p className="reports-panel__eyebrow">Available report</p>
          <h2 id="billing-report-title">Sponsor Billing</h2>
        </div>
        <span className="reports-panel__tag">Purchases by sponsor</span>
      </div>

      <form className="reports-filters" onSubmit={(event) => { event.preventDefault(); setRange({ ...filters }); }}>
        <label>
          From
          <input type="date" value={filters.startDate} max={filters.endDate} required
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} />
        </label>
        <label>
          Through
          <input type="date" value={filters.endDate} min={filters.startDate} required
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} />
        </label>
        <button type="submit" disabled={loading || !filters.startDate || !filters.endDate}>
          {loading ? 'Updating...' : 'View report'}
        </button>
      </form>

      {error && <p className="reports-message reports-message--error" role="alert">{error}</p>}

      <div className="reports-summary" aria-label="Billing summary">
        <article className="reports-summary__card">
          <span>Purchases</span>
          <strong>{loading || !report ? '—' : report.totals.orderCount.toLocaleString()}</strong>
        </article>
        <article className="reports-summary__card">
          <span>Points redeemed</span>
          <strong>{loading || !report ? '—' : formatPoints(report.totals.pointsRedeemed)}</strong>
        </article>
        <article className="reports-summary__card reports-summary__card--highlight">
          <span>Total to bill</span>
          <strong>{loading || !report ? '—' : formatPrice(report.totals.amountDue)}</strong>
        </article>
      </div>

      <div className="reports-results__heading">
        <div>
          <h3>Amount due by sponsor</h3>
          <p>{formatDay(range.startDate)} – {formatDay(range.endDate)}. Canceled orders are not billed.</p>
        </div>
      </div>

      {loading ? (
        <p className="reports-empty" role="status">Building your report...</p>
      ) : !report ? null : report.sponsors.length === 0 ? (
        <p className="reports-empty">No purchases were made in this date range.</p>
      ) : (
        <>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <caption className="visually-hidden">Amount due by sponsor</caption>
              <thead>
                <tr>
                  <th scope="col">Sponsor</th>
                  <th scope="col">Purchases</th>
                  <th scope="col">Points redeemed</th>
                  <th scope="col">Amount due</th>
                </tr>
              </thead>
              <tbody>
                {report.sponsors.map((entry) => (
                  <tr key={entry.sponsorId}>
                    <td data-label="Sponsor"><strong>{entry.sponsorName}</strong></td>
                    <td data-label="Purchases">{entry.orderCount.toLocaleString()}</td>
                    <td data-label="Points redeemed">{formatPoints(entry.pointsRedeemed)}</td>
                    <td data-label="Amount due"><strong>{formatPrice(entry.amountDue)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="reports-results__heading">
            <div>
              <h3>Purchases</h3>
              <p>Every billed purchase and the sponsor it came from.</p>
            </div>
            <div className="billing-report__actions">
              <label className="billing-report__filter">
                Sponsor
                <select value={sponsorFilter} onChange={(event) => setSponsorFilter(event.target.value)}>
                  <option value="all">All sponsors</option>
                  {report.sponsors.map((entry) => (
                    <option key={entry.sponsorId} value={String(entry.sponsorId)}>{entry.sponsorName}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="reports-download" onClick={downloadCsv}>Download CSV</button>
            </div>
          </div>

          <div className="reports-table-wrap">
            <table className="reports-table">
              <caption className="visually-hidden">Billed purchases</caption>
              <thead>
                <tr>
                  <th scope="col">Sponsor</th>
                  <th scope="col">Order</th>
                  <th scope="col">Date</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Item</th>
                  <th scope="col">Status</th>
                  <th scope="col">Points</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.orderId}>
                    <td data-label="Sponsor">{purchase.sponsorName}</td>
                    <td data-label="Order">#{purchase.orderId}</td>
                    <td data-label="Date">{formatOrderDate(purchase.createdAt)}</td>
                    <td data-label="Driver">{purchase.driverName}</td>
                    <td data-label="Item">{purchase.productTitle}</td>
                    <td data-label="Status">{orderStatusLabel(purchase.status)}</td>
                    <td data-label="Points">{formatPoints(purchase.pointCost)}</td>
                    <td data-label="Amount">{formatPrice(purchase.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
