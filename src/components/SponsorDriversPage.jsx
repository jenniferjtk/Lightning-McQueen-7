import React, { useEffect, useMemo, useState } from 'react';
import AdjustPointsForm from './AdjustPointsForm.jsx';
import { PointsTrendChart } from './PointCharts.jsx';
import PointChangeReportForm from './PointChangeReportForm.jsx';
import BulkUserUpload from './BulkUserUpload.jsx';

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A to Z)' },
  { value: 'name-desc', label: 'Name (Z to A)' },
  { value: 'points-desc', label: 'Points (high to low)' },
  { value: 'points-asc', label: 'Points (low to high)' },
];

function compareNames(left, right) {
  const firstNameOrder = String(left.firstName ?? '').localeCompare(String(right.firstName ?? ''));
  return firstNameOrder || String(left.lastName ?? '').localeCompare(String(right.lastName ?? ''));
}

function pointValue(driver) {
  const points = Number(driver.points ?? 0);
  return Number.isFinite(points) ? points : 0;
}

function formatDate(dateValue) {
  if (!dateValue) return 'Not available';
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSignedPoints(value) {
  return `${value > 0 ? '+' : ''}${Number(value).toLocaleString()} pts`;
}

export default function SponsorDriversPage({ user }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sponsorLinked, setSponsorLinked] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [pointHistoryVisible, setPointHistoryVisible] = useState(false);
  const [pointHistoryVersion, setPointHistoryVersion] = useState(0);
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState('');
  const [pointEntries, setPointEntries] = useState([]);
  const [pointEntriesLoading, setPointEntriesLoading] = useState(false);
  const [pointEntriesError, setPointEntriesError] = useState('');
  const [bulkRuleId, setBulkRuleId] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkStatus, setBulkStatus] = useState({ type: '', message: '' });
  const [suspendHours, setSuspendHours] = useState(24);
  const [suspendUnit, setSuspendUnit] = useState('hours');
  const [suspendSubmitting, setSuspendSubmitting] = useState(false);
  const [suspendStatus, setSuspendStatus] = useState({ type: '', message: '' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch('/api/sponsor/drivers', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load drivers.');
        if (!Array.isArray(data.drivers)) throw new Error('Unable to load drivers.');
        setDrivers(data.drivers);
        setSponsorLinked(data.sponsorLinked);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  useEffect(() => {
    fetch('/api/sponsor-rules', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load point rules.');
        if (!Array.isArray(data.rules)) throw new Error('Unable to load point rules.');
        return data.rules.filter((rule) => Number(rule.sponsor_id) === Number(user?.sponsorId));
      })
      .then(setRules)
      .catch((requestError) => setRulesError(requestError.message))
      .finally(() => setRulesLoading(false));
  }, [user?.sponsorId]);

  useEffect(() => {
    if (!selectedDriverId || !pointHistoryVisible) return;
    let isCurrent = true;
    setPointEntriesLoading(true);
    setPointEntriesError('');
    fetch(`/api/sponsor/drivers/${selectedDriverId}/points/entries`, { credentials: 'include' })
      .then(async (response) => {
        let data;
        try {
          data = await response.json();
        } catch {
          throw new Error('The point changes API returned a non-JSON response. Restart the backend or deploy the latest API version.');
        }
        if (!response.ok) throw new Error(data.message || 'Unable to load point changes.');
        if (!Array.isArray(data.entries)) throw new Error('Unable to load point changes.');
        if (isCurrent) setPointEntries(data.entries);
      })
      .catch((requestError) => {
        if (isCurrent) setPointEntriesError(requestError.message);
      })
      .finally(() => {
        if (isCurrent) setPointEntriesLoading(false);
      });
    return () => { isCurrent = false; };
  }, [selectedDriverId, pointHistoryVisible, pointHistoryVersion]);

  const visibleDrivers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = query
      ? drivers.filter((driver) => `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.toLocaleLowerCase().includes(query))
      : drivers;

    return [...filtered].sort((left, right) => {
      if (sort.startsWith('name')) {
        const comparison = compareNames(left, right);
        return sort === 'name-asc' ? comparison : -comparison;
      }
      const pointsOrder = pointValue(left) - pointValue(right);
      return sort === 'points-asc' ? pointsOrder : -pointsOrder;
    });
  }, [drivers, search, sort]);
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId);

  const durationHours = suspendUnit === 'days' ? suspendHours * 24 : suspendUnit === 'weeks' ? suspendHours * 24 * 7 : suspendHours;

  const applyBulkPoints = async () => {
    if (!bulkRuleId) return;

    const selectedRule = rules.find((rule) => Number(rule.rule_id) === Number(bulkRuleId));
    const pointChange = Number(selectedRule?.pt_value ?? 0);
    if (drivers.length === 0) {
      setBulkStatus({ type: 'error', message: 'No drivers are available to adjust.' });
      return;
    }
    if (Math.abs(pointChange) >= 100) {
      const action = pointChange < 0 ? 'remove' : 'add';
      if (!window.confirm(`Are you sure you want to ${action} ${Math.abs(pointChange).toLocaleString()} points for every driver?`)) return;
    }

    setBulkSubmitting(true);
    setBulkStatus({ type: '', message: '' });

    let successCount = 0;
    let failureCount = 0;

    for (const driver of drivers) {
      try {
        const response = await fetch('/api/points/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driverUserId: driver.id, ruleId: Number(bulkRuleId), comment: '' }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Unable to apply the point rule.');

        successCount += 1;
        setDrivers((current) => current.map((currentDriver) => (
          currentDriver.id === driver.id
            ? { ...currentDriver, points: pointValue(currentDriver) + Number(data.change_amount) }
            : currentDriver
        )));
      } catch {
        failureCount += 1;
      }
    }

    setBulkSubmitting(false);
    setBulkStatus({
      type: failureCount > 0 ? 'error' : 'success',
      message: failureCount > 0
        ? `Applied ${selectedRule?.description || 'the selected rule'} to ${successCount} driver${successCount === 1 ? '' : 's'}. ${failureCount} driver${failureCount === 1 ? '' : 's'} could not be updated.`
        : `${selectedRule?.description || 'The selected rule'} was applied to all ${successCount} driver${successCount === 1 ? '' : 's'}.`,
    });
    setBulkRuleId('');
  };

  const handleSuspendSelectedDriver = async () => {
    if (!selectedDriver) return;
    const duration = selectedDriver.account_status === 'suspended' ? 0 : Number(durationHours);

    if (selectedDriver.account_status !== 'suspended' && (!Number.isFinite(duration) || duration <= 0 || duration > 8760)) {
      setSuspendStatus({ type: 'error', message: 'Choose a suspension length between 1 hour and 365 days.' });
      return;
    }

    setSuspendSubmitting(true);
    setSuspendStatus({ type: '', message: '' });

    try {
      const response = await fetch(`/api/sponsor/drivers/${selectedDriver.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationHours: duration }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to update the driver account status.');

      setDrivers((current) => current.map((driver) => (
        driver.id === selectedDriver.id
          ? { ...driver, account_status: data.suspended ? 'suspended' : 'active', suspended_until: data.suspendedUntil || null }
          : driver
      )));
      setSuspendStatus({
        type: 'success',
        message: data.suspended
          ? `Driver account suspended until ${new Date(data.suspendedUntil).toLocaleString()}.`
          : 'Driver account re-enabled.',
      });
    } catch (error) {
      setSuspendStatus({ type: 'error', message: error.message });
    } finally {
      setSuspendSubmitting(false);
    }
  };

  return (
    <main className="driver-management-page">
      <section className="driver-management-page__intro">
        <p className="driver-management-page__eyebrow">Sponsor tools</p>
        <h1>Driver management.</h1>
        <p>Find drivers in your organization and review their current point balances.</p>
      </section>

      {!loading && !error && sponsorLinked && (
        <BulkUserUpload onCreated={() => setReloadKey((key) => key + 1)} />
      )}

      {loading ? (
        <p className="driver-management-page__message">Loading drivers...</p>
      ) : error ? (
        <p className="driver-management-page__message" role="alert">{error}</p>
      ) : !sponsorLinked ? (
        <p className="driver-management-page__message" role="status">Your account is not linked to a sponsor organization.</p>
      ) : (
        <section className="card driver-management">
          <div className="driver-management__controls">
            <label>
              Search drivers
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name"
              />
            </label>
            <label>
              Sort by
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="driver-management__count" aria-live="polite">
            {visibleDrivers.length} {visibleDrivers.length === 1 ? 'driver' : 'drivers'}
          </p>

          <div className="driver-management__bulk-adjustment">
            <h2>Adjust points for all drivers</h2>
            {rules.length === 0 ? (
              <p className="driver-management-page__message">Create a point rule to adjust all drivers' points.</p>
            ) : (
              <>
                <label>
                  Bulk point rule
                  <select
                    value={bulkRuleId}
                    onChange={(event) => setBulkRuleId(event.target.value)}
                    aria-label="Bulk point rule"
                  >
                    <option value="">Choose a rule...</option>
                    {rules.map((rule) => (
                      <option key={rule.rule_id} value={rule.rule_id}>
                        {rule.description} ({formatSignedPoints(Number(rule.pt_value))})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="applications-table__decide"
                  disabled={bulkSubmitting || !bulkRuleId}
                  onClick={applyBulkPoints}
                >
                  {bulkSubmitting ? 'Applying...' : 'Apply to all drivers'}
                </button>
                {bulkStatus.message && (
                  <p
                    className={`adjust-points__status adjust-points__status--${bulkStatus.type || 'success'}`}
                    role={bulkStatus.type === 'error' ? 'alert' : 'status'}
                  >
                    {bulkStatus.message}
                  </p>
                )}
              </>
            )}
          </div>

          {selectedDriver && (
            <section className="driver-management__application" aria-label="Driver application">
              <div className="driver-management__application-heading">
                <div>
                  <p className="driver-management__application-eyebrow">Driver application</p>
                  <h2>{selectedDriver.firstName} {selectedDriver.lastName}</h2>
                </div>
                <div className="driver-management__application-actions">
                  <button
                    type="button"
                    aria-expanded={pointHistoryVisible}
                    aria-controls="driver-point-history"
                    onClick={() => setPointHistoryVisible((visible) => !visible)}
                  >
                    {pointHistoryVisible ? 'Hide point history' : 'Show point history'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDriverId(null);
                      setPointHistoryVisible(false);
                    }}
                  >
                    Close Panel
                  </button>
                </div>
              </div>
              <div className="driver-management__account-access">
                <div className="driver-management__account-access-header">
                  <h3>Account access</h3>
                  <span className={`applications-table__status applications-table__status--${selectedDriver.account_status === 'suspended' ? 'rejected' : 'approved'}`}>
                    {selectedDriver.account_status === 'suspended' ? 'Suspended' : 'Active'}
                  </span>
                </div>
                <div className="driver-management__suspension-form">
                  <label>
                    Suspend for
                    <input
                      type="number"
                      min="1"
                      max="8760"
                      step="1"
                      value={suspendHours}
                      onChange={(event) => setSuspendHours(Number(event.target.value) || 1)}
                      aria-label="Suspend duration"
                    />
                  </label>
                  <label>
                    <select value={suspendUnit} onChange={(event) => setSuspendUnit(event.target.value)} aria-label="Suspend unit">
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                    </select>
                  </label>
                  <button type="button" onClick={handleSuspendSelectedDriver} disabled={suspendSubmitting}>
                    {selectedDriver.account_status === 'suspended' ? 'Re-enable account' : 'Suspend account'}
                  </button>
                </div>
                {suspendStatus.message && (
                  <p className={`adjust-points__status adjust-points__status--${suspendStatus.type || 'success'}`} role={suspendStatus.type === 'error' ? 'alert' : 'status'}>
                    {suspendStatus.message}
                  </p>
                )}
                {selectedDriver.account_status === 'suspended' && selectedDriver.suspended_until && (
                  <p className="driver-management__suspension-note">
                    Re-enables automatically on {new Date(selectedDriver.suspended_until).toLocaleString()}.
                  </p>
                )}
              </div>
              <dl className="driver-management__application-details">
                <div>
                  <dt>Email</dt>
                  <dd>{selectedDriver.email}</dd>
                </div>
                <div>
                  <dt>Sponsor</dt>
                  <dd>{selectedDriver.sponsorName || 'Your organization'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`applications-table__status applications-table__status--${selectedDriver.status || 'approved'}`}>
                      {selectedDriver.status || 'approved'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{formatDate(selectedDriver.submittedAt)}</dd>
                </div>
                <div>
                  <dt>Decision date</dt>
                  <dd>{formatDate(selectedDriver.decidedAt)}</dd>
                </div>
                <div>
                  <dt>Current points</dt>
                  <dd>{pointValue(selectedDriver).toLocaleString()}</dd>
                </div>
              </dl>
              {pointHistoryVisible && (
                <>
                  <div className="driver-management__point-history" id="driver-point-history">
                    <PointsTrendChart
                      key={`${selectedDriver.id}-${pointHistoryVersion}`}
                      endpoint={`/api/sponsor/drivers/${selectedDriver.id}/points/trend`}
                      title={`Point history for ${selectedDriver.firstName} ${selectedDriver.lastName}`}
                      fallbackError={`Unable to load ${selectedDriver.firstName} ${selectedDriver.lastName}'s point history.`}
                    />
                  </div>
                  <section className="driver-management__point-entries" aria-label="Recent point changes">
                    <h3>Recent point changes</h3>
                    {pointEntriesLoading ? (
                      <p className="driver-management-page__message">Loading point changes...</p>
                    ) : pointEntriesError ? (
                      <p className="driver-management-page__message" role="alert">{pointEntriesError}</p>
                    ) : pointEntries.length === 0 ? (
                      <p className="driver-management-page__message">No point changes to review.</p>
                    ) : (
                      <ul className="points-activity-card__list">
                        {pointEntries.map((entry) => (
                          <li key={entry.id} className="points-activity-card__item">
                            <div>
                              <p className="points-activity-card__label">{entry.label}</p>
                              <p className="points-activity-card__date">{entry.date}</p>
                            </div>
                            <span className={entry.amount >= 0 ? 'points-activity-card__amount points-activity-card__amount--positive' : 'points-activity-card__amount points-activity-card__amount--negative'}>
                              {entry.amount >= 0 ? '+' : '-'}{Math.abs(entry.amount).toLocaleString()} pts
                            </span>
                            <PointChangeReportForm entry={entry} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
              <div className="driver-management__point-adjustment">
                <h3>Adjust points</h3>
                {rulesLoading ? (
                  <p className="driver-management-page__message">Loading point rules...</p>
                ) : rulesError ? (
                  <p className="driver-management-page__message" role="alert">{rulesError}</p>
                ) : (
                  <AdjustPointsForm
                    driverUserId={selectedDriver.id}
                    rules={rules}
                    onApplied={(changeAmount) => {
                      setDrivers((current) => current.map((driver) => (
                        driver.id === selectedDriver.id
                          ? { ...driver, points: pointValue(driver) + changeAmount }
                          : driver
                      )));
                      setPointHistoryVersion((version) => version + 1);
                    }}
                  />
                )}
              </div>
            </section>
          )}

          {visibleDrivers.length === 0 ? (
            <p className="driver-management-page__message">
              {drivers.length === 0 ? 'No drivers have joined your organization yet.' : 'No drivers match your search.'}
            </p>
          ) : (
            <div className="driver-management__table-wrap">
              <table className="driver-management__table">
                <thead>
                  <tr>
                    <th scope="col">Driver</th>
                    <th scope="col">Email</th>
                    <th scope="col">Points</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDrivers.map((driver) => (
                    <tr key={driver.id}>
                      <td>{driver.firstName} {driver.lastName}</td>
                      <td>{driver.email}</td>
                      <td>{pointValue(driver).toLocaleString()}</td>
                      <td>
                        <div className="driver-management__row-actions">
                          <button
                            type="button"
                            className="driver-management__view-application"
                            aria-pressed={selectedDriverId === driver.id}
                            onClick={() => {
                              setSelectedDriverId(driver.id);
                              setPointHistoryVisible(false);
                            }}
                          >
                            Adjust Points
                          </button>
                          <button
                            type="button"
                            className="driver-management__suspend-driver"
                            onClick={() => {
                              setSelectedDriverId(driver.id);
                              setPointHistoryVisible(false);
                            }}
                          >
                            {driver.account_status === 'suspended' ? 'Re-enable' : 'Suspend'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
