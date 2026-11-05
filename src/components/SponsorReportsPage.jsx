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

const csvCell = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = String(value ?? '');
  const safeText = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

export default function SponsorReportsPage({ user }) {
  const initialRange = useMemo(defaultDateRange, []);
  const [drivers, setDrivers] = useState([]);
  const [driverLoading, setDriverLoading] = useState(true);
  const [driverError, setDriverError] = useState('');
  const [filters, setFilters] = useState({ ...initialRange, driverId: 'all' });
  const [reportFilters, setReportFilters] = useState({ ...initialRange, driverId: 'all' });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    let active = true;
    const url = user?.role === 'admin' ? '/api/admin/drivers' : '/api/sponsor/drivers';
    fetch(url, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load drivers.');
        if (!Array.isArray(data.drivers)) throw new Error('Unable to load drivers.');
        return data.drivers;
      })
      .then((rows) => {
        if (active) setDrivers(rows.map((driver) => ({
          id: driver.id,
          name: `${driver.firstName} ${driver.lastName}`.trim(),
        })));
      })
      .catch((error) => {
        if (active) setDriverError(error.message);
      })
      .finally(() => {
        if (active) setDriverLoading(false);
      });
    return () => { active = false; };
  }, [user?.role]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(reportFilters);
    setLoading(true);
    setReportError('');
    fetch(`/api/reports/sponsor-points?${query}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load the report.');
        if (!Array.isArray(data.entries)) throw new Error('The report response was invalid.');
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

  const uniqueDrivers = new Set(entries.map((entry) => entry.driverId)).size;
  const netChange = entries.reduce((total, entry) => total + entry.pointChange, 0);

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const submitFilters = (event) => {
    event.preventDefault();
    setReportFilters({ ...filters });
  };

  const downloadCsv = () => {
    const headers = [
      'Driver Name',
      'Total Points',
      'Point Change',
      'Date of Point Change',
      'Sponsor Making the Point Change',
      'Reason for Point Change',
    ];
    const rows = entries.map((entry) => [
      entry.driverName,
      entry.totalPoints,
      entry.pointChange,
      entry.changeDate,
      entry.sponsorName,
      entry.reason,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sponsor-point-report-${reportFilters.startDate}-to-${reportFilters.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="reports-page">
      <header className="reports-page__intro">
        <p className="reports-page__eyebrow">Insights &amp; reporting</p>
        <h1>Reports that keep every point in view.</h1>
        <p>Explore driver activity, understand every balance change, and export a report when you need to share it.</p>
      </header>

      <section className="reports-panel" aria-labelledby="reports-title">
        <div className="reports-panel__heading">
          <div>
            <p className="reports-panel__eyebrow">Available report</p>
            <h2 id="reports-title">Sponsor Report</h2>
          </div>
          <span className="reports-panel__tag">Driver Point Tracking</span>
        </div>

        <form className="reports-filters" onSubmit={submitFilters}>
          <label>
            Driver
            <select
              value={filters.driverId}
              onChange={(event) => updateFilter('driverId', event.target.value)}
              disabled={driverLoading || Boolean(driverError)}
            >
              <option value="all">All Drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
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
          <button type="submit" disabled={loading || driverLoading || !filters.startDate || !filters.endDate}>
            {loading ? 'Updating...' : 'View report'}
          </button>
        </form>

        {driverError && <p className="reports-message reports-message--error" role="alert">{driverError}</p>}
        {reportError && <p className="reports-message reports-message--error" role="alert">{reportError}</p>}

        <div className="reports-summary" aria-label="Report summary">
          <article className="reports-summary__card">
            <span>Point changes</span>
            <strong>{loading ? '—' : entries.length.toLocaleString()}</strong>
          </article>
          <article className="reports-summary__card">
            <span>Drivers included</span>
            <strong>{loading ? '—' : uniqueDrivers.toLocaleString()}</strong>
          </article>
          <article className="reports-summary__card reports-summary__card--highlight">
            <span>Net change in range</span>
            <strong>{loading ? '—' : `${netChange > 0 ? '+' : ''}${netChange.toLocaleString()} pts`}</strong>
          </article>
        </div>

        <div className="reports-results__heading">
          <div>
            <h3>Point change activity</h3>
            <p>{formatDate(reportFilters.startDate)} – {formatDate(reportFilters.endDate)}</p>
          </div>
          <button type="button" className="reports-download" onClick={downloadCsv} disabled={loading || entries.length === 0}>
            Download CSV
          </button>
        </div>

        {loading ? (
          <p className="reports-empty" role="status">Building your report...</p>
        ) : reportError ? null : entries.length === 0 ? (
          <p className="reports-empty">No point changes were recorded for these filters.</p>
        ) : (
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th scope="col">Driver</th>
                  <th scope="col">Total points</th>
                  <th scope="col">Point change</th>
                  <th scope="col">Change date</th>
                  <th scope="col">Sponsor</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={`${entry.driverId}-${entry.changeDate}-${index}`}>
                    <td data-label="Driver"><strong>{entry.driverName}</strong></td>
                    <td data-label="Total points">{entry.totalPoints.toLocaleString()} pts</td>
                    <td data-label="Point change">
                      <span className={`reports-table__change${entry.pointChange < 0 ? ' reports-table__change--negative' : ''}`}>
                        {entry.pointChange > 0 ? '+' : ''}{entry.pointChange.toLocaleString()} pts
                      </span>
                    </td>
                    <td data-label="Change date">{formatDate(entry.changeDate)}</td>
                    <td data-label="Sponsor">{entry.sponsorName}</td>
                    <td data-label="Reason">{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
