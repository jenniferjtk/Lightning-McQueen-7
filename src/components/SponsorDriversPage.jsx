import React, { useEffect, useMemo, useState } from 'react';
import AdjustPointsForm from './AdjustPointsForm.jsx';
import { PointsTrendChart } from './PointCharts.jsx';

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
  }, []);

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

  return (
    <main className="driver-management-page">
      <section className="driver-management-page__intro">
        <p className="driver-management-page__eyebrow">Sponsor tools</p>
        <h1>Driver management.</h1>
        <p>Find drivers in your organization and review their current point balances.</p>
      </section>

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
                    Close application
                  </button>
                </div>
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
                <div className="driver-management__point-history" id="driver-point-history">
                  <PointsTrendChart
                    key={`${selectedDriver.id}-${pointHistoryVersion}`}
                    endpoint={`/api/sponsor/drivers/${selectedDriver.id}/points/trend`}
                    title={`Point history for ${selectedDriver.firstName} ${selectedDriver.lastName}`}
                  />
                </div>
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
                        <button
                          type="button"
                          className="driver-management__view-application"
                          aria-pressed={selectedDriverId === driver.id}
                          onClick={() => {
                            setSelectedDriverId(driver.id);
                            setPointHistoryVisible(false);
                          }}
                        >
                          {selectedDriverId === driver.id ? 'Viewing application' : 'View application'}
                        </button>
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
