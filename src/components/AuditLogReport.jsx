import React, { useEffect, useMemo, useState } from 'react';

const CATEGORIES = [
  { value: 'driver_application', label: 'Driver applications' },
  { value: 'point_change', label: 'Point changes' },
  { value: 'password_change', label: 'Password changes' },
  { value: 'login_attempt', label: 'Login attempts' },
];

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
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const formattedDate = new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return time ? `${formattedDate}, ${time}` : formattedDate;
};

const categoryLabel = (category) => CATEGORIES.find((option) => option.value === category)?.label || category;

const csvCell = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = String(value ?? '');
  const safeText = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

const columnsByCategory = {
  driver_application: [
    { label: 'Date', value: (entry) => formatDate(entry.date) },
    { label: 'Sponsor', value: (entry) => entry.sponsorName || '—' },
    { label: 'Driver', value: (entry) => entry.driverName || '—' },
    { label: 'Status', value: (entry) => entry.status || '—' },
  ],
  point_change: [
    { label: 'Date', value: (entry) => formatDate(entry.date) },
    { label: 'Sponsor user', value: (entry) => entry.sponsorUserName || '—' },
    { label: 'Driver', value: (entry) => entry.driverName || '—' },
    {
      label: 'Points',
      value: (entry) => entry.points === null ? '—' : `${entry.points > 0 ? '+' : ''}${entry.points}`,
    },
    { label: 'Reason', value: (entry) => entry.reason || '—' },
  ],
  password_change: [
    { label: 'Date', value: (entry) => formatDate(entry.date) },
    { label: 'User', value: (entry) => entry.driverName || '—' },
    { label: 'Type of change', value: (entry) => entry.changeType || '—' },
  ],
  login_attempt: [
    { label: 'Date', value: (entry) => formatDate(entry.date) },
    { label: 'Username', value: (entry) => entry.username || '—' },
    { label: 'Result', value: (entry) => (entry.success ? 'Success' : 'Failure') },
  ],
};

export default function AuditLogReport() {
  const initialRange = useMemo(defaultDateRange, []);
  const [filters, setFilters] = useState({ ...initialRange, category: 'driver_application' });
  const [reportFilters, setReportFilters] = useState({ ...initialRange, category: 'driver_application' });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(reportFilters);
    setLoading(true);
    setError('');
    fetch(`/api/reports/audit-log?${query}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load the audit log.');
        if (!Array.isArray(data.entries)) throw new Error('The audit log response was invalid.');
        return data.entries;
      })
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch((fetchError) => {
        if (active) {
          setEntries([]);
          setError(fetchError.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reportFilters]);

  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const submitFilters = (event) => {
    event.preventDefault();
    setReportFilters({ ...filters });
  };

  const downloadCsv = () => {
    const columns = columnsByCategory[reportFilters.category];
    const rows = entries.map((entry) => columns.map((column) => column.value(entry)));
    const csv = [columns.map((column) => column.label), ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${reportFilters.category}-${reportFilters.startDate}-to-${reportFilters.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="reports-panel" aria-labelledby="audit-log-title">
      <div className="reports-panel__heading">
        <div>
          <p className="reports-panel__eyebrow">Available report</p>
          <h2 id="audit-log-title">Audit Log</h2>
        </div>
        <span className="reports-panel__tag">Significant state changes</span>
      </div>

      <form className="reports-filters" onSubmit={submitFilters}>
        <label>
          Category
          <select
            aria-label="Audit log category"
            value={filters.category}
            onChange={(event) => updateFilter('category', event.target.value)}
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
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
        <button type="submit" disabled={loading || !filters.startDate || !filters.endDate}>
          {loading ? 'Updating...' : 'View audit log'}
        </button>
      </form>

      {error && <p className="reports-message reports-message--error" role="alert">{error}</p>}

      <div className="reports-results__heading">
        <div>
          <h3>{categoryLabel(reportFilters.category)}</h3>
          <p>{reportFilters.startDate} – {reportFilters.endDate}</p>
        </div>
        <button
          type="button"
          className="reports-download"
          onClick={downloadCsv}
          disabled={loading || entries.length === 0}
        >
          Download CSV
        </button>
      </div>

      {loading ? (
        <p className="reports-empty" role="status">Loading audit log...</p>
      ) : error ? null : entries.length === 0 ? (
        <p className="reports-empty">No audit events were recorded for these filters.</p>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table audit-log-table">
            <thead>
              <tr>
                {columnsByCategory[reportFilters.category].map((column) => (
                  <th key={column.label} scope="col">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={`${entry.category}-${entry.driverId}-${entry.date}-${index}`}>
                  {columnsByCategory[reportFilters.category].map((column) => (
                    <td key={column.label}>{column.value(entry)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
