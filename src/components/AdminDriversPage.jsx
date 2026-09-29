import React, { useEffect, useMemo, useState } from 'react';

const EMPTY_DRIVER = { firstName: '', lastName: '', email: '', password: '' };

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newDriver, setNewDriver] = useState(EMPTY_DRIVER);
  const [editingId, setEditingId] = useState(null);
  const [editDriver, setEditDriver] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const loadDrivers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/drivers', { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load drivers.');
      setDrivers(data.drivers);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDrivers(); }, []);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return drivers;
    return drivers.filter((driver) => [driver.firstName, driver.lastName, driver.email]
      .some((value) => value.toLowerCase().includes(query)));
  }, [drivers, search]);

  const updateNewDriver = (event) => {
    const { name, value } = event.target;
    setNewDriver((current) => ({ ...current, [name]: value }));
  };

  const createDriver = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newDriver),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to create the driver.');
      setDrivers((current) => [data.driver, ...current]);
      setNewDriver(EMPTY_DRIVER);
      setNotice('Driver account created.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (driver) => {
    setResettingId(null);
    setResetPassword('');
    setConfirmPassword('');
    setEditingId(driver.id);
    setEditDriver({ firstName: driver.firstName, lastName: driver.lastName, email: driver.email });
    setError('');
    setNotice('');
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/drivers/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editDriver),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to update the driver.');
      setDrivers((current) => current.map((driver) => driver.id === data.driver.id ? data.driver : driver));
      setEditingId(null);
      setEditDriver(null);
      setNotice('Driver account updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteDriver = async (driver) => {
    if (!window.confirm(`Delete ${driver.firstName} ${driver.lastName}'s account? This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/drivers/${driver.id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Unable to delete the driver.');
      }
      setDrivers((current) => current.filter((entry) => entry.id !== driver.id));
      setNotice('Driver account deleted.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const resetDriverPassword = async (event, driver) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (resetPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!window.confirm(`Reset ${driver.firstName} ${driver.lastName}'s password?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/drivers/${driver.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to reset the password.');
      setResettingId(null);
      setResetPassword('');
      setConfirmPassword('');
      setNotice(`Password reset for ${driver.firstName} ${driver.lastName}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-drivers-page">
      <section className="admin-drivers-page__intro">
        <div>
          <p className="admin-home-page__eyebrow">Administration</p>
          <h1>Driver accounts</h1>
          <p>Create and maintain driver accounts. Administrative users are not shown here.</p>
        </div>
        <p className="admin-drivers-page__count">{drivers.length} driver{drivers.length === 1 ? '' : 's'}</p>
      </section>

      {error && <p className="admin-drivers-page__message admin-drivers-page__message--error" role="alert">{error}</p>}
      {notice && <p className="admin-drivers-page__message admin-drivers-page__message--success" role="status">{notice}</p>}

      <section className="admin-driver-create card">
        <h2 className="card__title">Create driver account</h2>
        <form className="admin-driver-form" onSubmit={createDriver}>
          <label>First name<input name="firstName" value={newDriver.firstName} onChange={updateNewDriver} required /></label>
          <label>Last name<input name="lastName" value={newDriver.lastName} onChange={updateNewDriver} required /></label>
          <label>Email address<input type="email" name="email" value={newDriver.email} onChange={updateNewDriver} required /></label>
          <label>Temporary password<input type="password" name="password" value={newDriver.password} onChange={updateNewDriver} minLength="8" autoComplete="new-password" required /></label>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create driver'}</button>
        </form>
      </section>

      <section className="admin-driver-list card" aria-labelledby="driver-list-title">
        <div className="admin-driver-list__header">
          <h2 className="card__title" id="driver-list-title">All drivers</h2>
          <label className="admin-driver-list__search">Search drivers<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></label>
        </div>

        {loading ? <p className="purchases-card__empty">Loading drivers...</p> : filteredDrivers.length === 0 ? (
          <p className="purchases-card__empty">No driver accounts match your search.</p>
        ) : (
          <div className="admin-driver-list__table-wrap">
            <table className="admin-driver-table">
              <thead><tr><th>Driver</th><th>Email</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{filteredDrivers.map((driver) => resettingId === driver.id ? (
                <tr key={driver.id} className="admin-driver-table__edit-row"><td colSpan="4">
                  <form className="admin-driver-edit" onSubmit={(event) => resetDriverPassword(event, driver)}>
                    <span>Reset password for {driver.firstName} {driver.lastName}</span>
                    <label>New password<input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength="8" autoComplete="new-password" disabled={saving} required autoFocus /></label>
                    <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="8" autoComplete="new-password" disabled={saving} required /></label>
                    <button type="submit" disabled={saving}>{saving ? 'Resetting...' : 'Reset password'}</button>
                    <button type="button" className="admin-driver-button--secondary" disabled={saving} onClick={() => { setResettingId(null); setResetPassword(''); setConfirmPassword(''); }}>Cancel</button>
                  </form>
                </td></tr>
              ) : editingId === driver.id ? (
                <tr key={driver.id} className="admin-driver-table__edit-row"><td colSpan="4">
                  <form className="admin-driver-edit" onSubmit={saveEdit}>
                    <label>First name<input value={editDriver.firstName} onChange={(event) => setEditDriver((current) => ({ ...current, firstName: event.target.value }))} required /></label>
                    <label>Last name<input value={editDriver.lastName} onChange={(event) => setEditDriver((current) => ({ ...current, lastName: event.target.value }))} required /></label>
                    <label>Email<input type="email" value={editDriver.email} onChange={(event) => setEditDriver((current) => ({ ...current, email: event.target.value }))} required /></label>
                    <button type="submit" disabled={saving}>Save</button>
                    <button type="button" className="admin-driver-button--secondary" onClick={() => { setEditingId(null); setEditDriver(null); }}>Cancel</button>
                  </form>
                </td></tr>
              ) : (
                <tr key={driver.id}><td>{driver.firstName} {driver.lastName}</td><td>{driver.email}</td><td>{driver.createdAt ? new Date(driver.createdAt).toLocaleDateString() : '—'}</td><td className="admin-driver-table__actions"><button type="button" onClick={() => beginEdit(driver)} disabled={saving}>Edit</button><button type="button" disabled={saving} onClick={() => { setEditingId(null); setEditDriver(null); setResettingId(driver.id); setResetPassword(''); setConfirmPassword(''); setError(''); setNotice(''); }}>Reset password</button><button type="button" className="admin-driver-button--delete" onClick={() => deleteDriver(driver)} disabled={saving}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
