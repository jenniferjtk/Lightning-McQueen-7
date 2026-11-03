import React, { useEffect, useState } from 'react';

const createRow = (id) => ({
  localId: id,
  rule_id: null,
  sponsor_id: '',
  pt_value: '1',
  description: '',
  frequency: 'one-time',
  isEditing: true,
});

export default function PointManagementPage({ user, sponsors = [], readOnly = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [nextLocalId, setNextLocalId] = useState(1);
  const [activeSponsorId, setActiveSponsorId] = useState(sponsors[0]?.id ?? null);
  const canManage = !readOnly && (user?.role === 'admin' || user?.role === 'sponsor');
  const isDriver = user?.role === 'driver';

  useEffect(() => {
    if (!sponsors.some((sponsor) => Number(sponsor.id) === Number(activeSponsorId))) {
      setActiveSponsorId(sponsors[0]?.id ?? null);
    }
  }, [activeSponsorId, sponsors]);

  useEffect(() => {
    fetch('/api/sponsor-rules', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load point rules.');
        return data.rules;
      })
      .then((rules) => setRows(rules.map((rule) => ({ ...rule, isEditing: false }))))
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (id, field, value) => {
    setRows((currentRows) => currentRows.map((row) => (
      (row.rule_id ?? row.localId) === id ? { ...row, [field]: value } : row
    )));
  };

  const visibleRows = isDriver
    ? rows.filter((row) => Number(row.sponsor_id) === Number(activeSponsorId))
    : rows;

  const addRow = () => {
    setRows((currentRows) => [...currentRows, createRow(nextLocalId)]);
    setNextLocalId((currentId) => currentId + 1);
    setMessage('');
  };

  const saveRow = async (row) => {
    const rowId = row.rule_id ?? row.localId;
    setSavingId(rowId);
    setMessage('');
    try {
      const response = await fetch(row.rule_id ? `/api/sponsor-rules/${row.rule_id}` : '/api/sponsor-rules', {
        method: row.rule_id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorId: Number(row.sponsor_id),
          ptValue: Number(row.pt_value),
          description: row.description,
          frequency: row.frequency,
        }),
      });
      const data = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save the point rule.');
      setRows((currentRows) => currentRows.map((current) => (
        (current.rule_id ?? current.localId) === rowId
          ? { ...data.rule, localId: current.localId, isEditing: false }
          : current
      )));
      setMessage(row.rule_id ? 'Rule updated.' : 'Rule added.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingId(null);
    }
  };

  const deleteRow = async (row) => {
    if (!row.rule_id) {
      setRows((currentRows) => currentRows.filter((current) => current.localId !== row.localId));
      return;
    }
    setSavingId(row.rule_id);
    setMessage('');
    try {
      const response = await fetch(`/api/sponsor-rules/${row.rule_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to delete the point rule.');
      setRows((currentRows) => currentRows.filter((current) => current.rule_id !== row.rule_id));
      setMessage('Rule deleted.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="point-management-page">
      <section className="point-management-page__intro">
        <p className="point-management-page__eyebrow">{readOnly ? 'Preview point management' : 'Point management'}</p>
        <h1>{readOnly ? 'Point rules preview.' : 'Add or remove points.'}</h1>
        <p>{readOnly ? 'The authenticated administrator is viewing these rules without making changes.' : 'Record the reason for each point adjustment and choose whether it happens once or repeats.'}</p>
      </section>

      <section className="point-entry" aria-label="Sponsor point rules">
        {isDriver && sponsors.length > 1 && (
          <div className="point-management-sponsor-tabs" role="tablist" aria-label="Choose sponsor point rules">
            {sponsors.map((sponsor) => (
              <button
                key={sponsor.id}
                id={`point-management-sponsor-tab-${sponsor.id}`}
                type="button"
                role="tab"
                aria-selected={Number(activeSponsorId) === Number(sponsor.id)}
                aria-controls="point-management-sponsor-panel"
                className={Number(activeSponsorId) === Number(sponsor.id)
                  ? 'point-management-sponsor-tabs__tab point-management-sponsor-tabs__tab--active'
                  : 'point-management-sponsor-tabs__tab'}
                onClick={() => setActiveSponsorId(sponsor.id)}
              >
                {sponsor.name}
              </button>
            ))}
          </div>
        )}
        <div
          id="point-management-sponsor-panel"
          role={isDriver && sponsors.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={isDriver && sponsors.length > 1 ? `point-management-sponsor-tab-${activeSponsorId}` : undefined}
        >
        <div className="point-entry__header" aria-hidden="true">
          <span>Points</span>
          <span>Sponsor ID</span>
          <span>Description</span>
          <span>Frequency</span>
          <span>Actions</span>
        </div>

        <div className="point-entry__rows">
          {visibleRows.map((row, index) => (
            <div className="point-entry__row" key={row.rule_id ?? row.localId}>
              <label>
                <span className="point-entry__mobile-label">Points</span>
                <input
                  aria-label={`Points for adjustment ${index + 1}`}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={row.pt_value}
                  disabled={!canManage || !row.isEditing}
                  onChange={(event) => updateRow(row.rule_id ?? row.localId, 'pt_value', event.target.value)}
                />
              </label>
              <label>
                <span className="point-entry__mobile-label">Sponsor ID</span>
                <input
                  aria-label={`Sponsor organization ID for rule ${index + 1}`}
                  type="number"
                  min="1"
                  step="1"
                  value={row.sponsor_id}
                  disabled={!canManage || !row.isEditing}
                  onChange={(event) => updateRow(row.rule_id ?? row.localId, 'sponsor_id', event.target.value)}
                />
              </label>
              <label>
                <span className="point-entry__mobile-label">Description</span>
                <input
                  aria-label={`Description for adjustment ${index + 1}`}
                  type="text"
                  maxLength="45"
                  placeholder="Why are points changing?"
                  value={row.description}
                  disabled={!canManage || !row.isEditing}
                  onChange={(event) => updateRow(row.rule_id ?? row.localId, 'description', event.target.value)}
                />
              </label>
              <fieldset className="point-entry__frequency">
                <legend>Frequency for adjustment {index + 1}</legend>
                <label className={`${row.frequency === 'one-time' ? 'is-selected' : ''}${!canManage || !row.isEditing ? ' is-disabled' : ''}`}>
                  <input
                    type="radio"
                    name={`frequency-${row.rule_id ?? row.localId}`}
                    value="one-time"
                    checked={row.frequency === 'one-time'}
                    disabled={!canManage || !row.isEditing}
                    onChange={(event) => updateRow(row.rule_id ?? row.localId, 'frequency', event.target.value)}
                  />
                  One-time
                </label>
                <label className={`${row.frequency === 'recurring' ? 'is-selected' : ''}${!canManage || !row.isEditing ? ' is-disabled' : ''}`}>
                  <input
                    type="radio"
                    name={`frequency-${row.rule_id ?? row.localId}`}
                    value="recurring"
                    checked={row.frequency === 'recurring'}
                    disabled={!canManage || !row.isEditing}
                    onChange={(event) => updateRow(row.rule_id ?? row.localId, 'frequency', event.target.value)}
                  />
                  Recurring
                </label>
              </fieldset>
              <div className="point-entry__actions">
                {canManage && row.isEditing ? (
                  <button type="button" onClick={() => saveRow(row)} disabled={savingId === (row.rule_id ?? row.localId)}>
                    {savingId === (row.rule_id ?? row.localId) ? 'Saving...' : row.rule_id ? 'Save changes' : 'Add rule'}
                  </button>
                ) : canManage ? (
                  <button type="button" onClick={() => updateRow(row.rule_id ?? row.localId, 'isEditing', true)}>
                    Edit
                  </button>
                ) : null}
                {canManage && (
                  <button className="point-entry__delete" type="button" onClick={() => deleteRow(row)} disabled={savingId === (row.rule_id ?? row.localId)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {loading && <p className="point-entry__state">Loading rules...</p>}
        {loadError && <p className="point-entry__state" role="alert">{loadError}</p>}
        {!loading && !loadError && visibleRows.length === 0 && <p className="point-entry__state">No point rules yet.</p>}
        {message && <p className="point-entry__state" role="status">{message}</p>}
        {canManage && (
          <button className="point-entry__add" type="button" onClick={addRow}>
            <span aria-hidden="true">+</span> Add another rule
          </button>
        )}
        </div>
      </section>
    </main>
  );
}