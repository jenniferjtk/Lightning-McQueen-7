import React, { useEffect, useMemo, useState } from 'react';

const dateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultDateRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
};

const formatDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const isValidDate = (value) => (
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
);

const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
}).format(Number(value) || 0);

const csvCell = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = String(value ?? '');
  const safeText = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

export default function AdminSalesReportsPage() {
  const initialRange = useMemo(defaultDateRange, []);
  const [filters, setFilters] = useState({
    ...initialRange,
    reportType: 'sponsor',
    sponsorId: 'all',
    driverId: 'all',
    view: 'summary',
  });
  const [reportFilters, setReportFilters] = useState({ ...filters });
  const [sponsors, setSponsors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    let active = true;
    const query = filters.sponsorId === 'all' ? '' : `?sponsorId=${encodeURIComponent(filters.sponsorId)}`;
    setOptionsLoading(true);
    setOptionsError('');
    fetch(`/api/admin/reports/sales/options${query}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load report filters.');
        if (!Array.isArray(data.sponsors) || !Array.isArray(data.drivers)) {
          throw new Error('The report filter response was invalid.');
        }
        return data;
      })
      .then((data) => {
        if (!active) return;
        setSponsors(data.sponsors);
        setDrivers(data.drivers);
      })
      .catch((error) => {
        if (active) setOptionsError(error.message);
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => { active = false; };
  }, [filters.sponsorId]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(reportFilters);
    setLoading(true);
    setReportError('');
    fetch(`/api/admin/reports/sales?${query}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load the sales report.');
        if (!Array.isArray(data.entries)) throw new Error('The sales report response was invalid.');
        if (reportFilters.view === 'detailed' && data.entries.some((entry) => (
          !entry || !isValidDate(entry.saleDate)
        ))) {
          throw new Error('The detailed sales report contains an invalid order date.');
        }
        return data.entries;
      })
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch((error) => {
        if (active) {
          setEntries([]);
          setReportError(error.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reportFilters]);

  const isSponsorReport = reportFilters.reportType === 'sponsor';
  const isSummary = reportFilters.view === 'summary';
  const orderCount = entries.reduce((total, entry) => total + Number(entry.orderCount ?? 1), 0);
  const salesTotal = entries.reduce((total, entry) => total + Number(entry.salesTotal ?? entry.amount ?? 0), 0);
  const pointsTotal = entries.reduce((total, entry) => total + Number(entry.pointsRedeemed ?? entry.pointCost ?? 0), 0);

  const updateFilter = (field, value) => setFilters((current) => ({
    ...current,
    [field]: value,
    ...(field === 'sponsorId' ? { driverId: 'all' } : {}),
  }));
  const submitFilters = (event) => {
    event.preventDefault();
    setEntries([]);
    setReportError('');
    setLoading(true);
    setReportFilters({ ...filters });
  };

  const downloadCsv = () => {
    const headers = isSummary
      ? isSponsorReport
        ? ['Sponsor', 'Orders', 'Sales', 'Points Redeemed']
        : ['Driver', 'Sponsor(s)', 'Orders', 'Sales', 'Points Redeemed']
      : ['Order ID', 'Date', 'Driver', 'Sponsor', 'Item', 'Sales', 'Points Redeemed', 'Status'];
    const rows = entries.map((entry) => (isSummary
      ? isSponsorReport
        ? [entry.sponsorName, Number(entry.orderCount), Number(entry.salesTotal), Number(entry.pointsRedeemed)]
        : [entry.driverName, entry.sponsorName, Number(entry.orderCount), Number(entry.salesTotal), Number(entry.pointsRedeemed)]
      : [
        Number(entry.orderId),
        entry.saleDate,
        entry.driverName,
        entry.sponsorName,
        entry.productTitle,
        Number(entry.amount),
        Number(entry.pointCost),
        entry.status,
      ]));
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-${reportFilters.reportType}-${reportFilters.view}-${reportFilters.startDate}-to-${reportFilters.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="reports-panel" aria-labelledby="admin-sales-reports-title">
      <div className="reports-panel__heading">
        <div>
          <p className="reports-panel__eyebrow">Admin reports</p>
          <h2 id="admin-sales-reports-title">Sales Reports</h2>
        </div>
        <span className="reports-panel__tag">Catalog order value</span>
      </div>

      <form className="reports-filters admin-sales-report-filters" onSubmit={submitFilters}>
        <label>
          Report
          <select value={filters.reportType} onChange={(event) => updateFilter('reportType', event.target.value)}>
            <option value="sponsor">Sales by Sponsor</option>
            <option value="driver">Sales by Driver</option>
          </select>
        </label>
        <label>
          Sponsor
          <select value={filters.sponsorId} onChange={(event) => updateFilter('sponsorId', event.target.value)} disabled={optionsLoading || Boolean(optionsError)}>
            <option value="all">All sponsors</option>
            {sponsors.map((sponsor) => (
              <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>
            ))}
          </select>
        </label>
        {filters.reportType === 'driver' && filters.sponsorId !== 'all' && (
          <label>
            Driver
            <select
              value={filters.driverId}
              onChange={(event) => updateFilter('driverId', event.target.value)}
              disabled={optionsLoading || Boolean(optionsError)}
            >
              <option value="all">All Drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          View
          <select value={filters.view} onChange={(event) => updateFilter('view', event.target.value)}>
            <option value="summary">Summary</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={filters.startDate}
            max={filters.endDate}
            onChange={(event) => updateFilter('startDate', event.target.value)}
            required
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={filters.endDate}
            min={filters.startDate}
            onChange={(event) => updateFilter('endDate', event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading || optionsLoading || !filters.startDate || !filters.endDate}>
          {loading ? 'Updating...' : 'View report'}
        </button>
      </form>

      {optionsError && <p className="reports-message reports-message--error" role="alert">{optionsError}</p>}
      {reportError && <p className="reports-message reports-message--error" role="alert">{reportError}</p>}

      <div className="reports-summary" aria-label="Report totals">
        <article className="reports-summary__card">
          <span>Orders</span>
          <strong>{loading ? '—' : orderCount.toLocaleString()}</strong>
        </article>
        <article className="reports-summary__card reports-summary__card--highlight">
          <span>Sales</span>
          <strong>{loading ? '—' : formatCurrency(salesTotal)}</strong>
        </article>
        <article className="reports-summary__card">
          <span>Points redeemed</span>
          <strong>{loading ? '—' : pointsTotal.toLocaleString()}</strong>
        </article>
      </div>

      <div className="reports-results__heading">
        <div>
          <h3>{isSponsorReport ? 'Sales by Sponsor' : 'Sales by Driver'} · {isSummary ? 'Summary' : 'Detailed'}</h3>
          <p>{formatDate(reportFilters.startDate)} – {formatDate(reportFilters.endDate)} · Excludes canceled orders</p>
        </div>
        <button type="button" className="reports-download" onClick={downloadCsv} disabled={loading || entries.length === 0}>
          Download CSV
        </button>
      </div>

      {loading ? (
        <p className="reports-empty" role="status">Building your report...</p>
      ) : reportError ? null : entries.length === 0 ? (
        <p className="reports-empty">No sales were recorded for these filters.</p>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              {isSummary ? (
                <tr>
                  <th scope="col">{isSponsorReport ? 'Sponsor' : 'Driver'}</th>
                  {!isSponsorReport && <th scope="col">Sponsor(s)</th>}
                  <th scope="col">Orders</th>
                  <th scope="col">Sales</th>
                  <th scope="col">Points redeemed</th>
                </tr>
              ) : (
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Date</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Sponsor</th>
                  <th scope="col">Item</th>
                  <th scope="col">Sales</th>
                  <th scope="col">Points</th>
                  <th scope="col">Status</th>
                </tr>
              )}
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={isSummary ? `${reportFilters.reportType}-${entry.sponsorId ?? entry.driverId}` : entry.orderId ?? index}>
                  {isSummary ? (
                    <>
                      <td><strong>{isSponsorReport ? entry.sponsorName : entry.driverName}</strong></td>
                      {!isSponsorReport && <td>{entry.sponsorName}</td>}
                      <td>{Number(entry.orderCount).toLocaleString()}</td>
                      <td>{formatCurrency(entry.salesTotal)}</td>
                      <td>{Number(entry.pointsRedeemed).toLocaleString()}</td>
                    </>
                  ) : (
                    <>
                      <td>{entry.orderId}</td>
                      <td>{formatDate(entry.saleDate)}</td>
                      <td><strong>{entry.driverName}</strong></td>
                      <td>{entry.sponsorName}</td>
                      <td>{entry.productTitle}</td>
                      <td>{formatCurrency(entry.amount)}</td>
                      <td>{Number(entry.pointCost).toLocaleString()}</td>
                      <td>{entry.status}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
