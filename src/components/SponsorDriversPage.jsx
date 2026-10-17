import React, { useEffect, useMemo, useState } from 'react';

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

export default function SponsorDriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sponsorLinked, setSponsorLinked] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name-asc');

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
                  </tr>
                </thead>
                <tbody>
                  {visibleDrivers.map((driver) => (
                    <tr key={driver.id}>
                      <td>{driver.firstName} {driver.lastName}</td>
                      <td>{driver.email}</td>
                      <td>{pointValue(driver).toLocaleString()}</td>
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
