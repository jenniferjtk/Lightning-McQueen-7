//eventually I want this page editable for sponsors and view only for drivers!

import React, { useState } from 'react';

const createRow = (id) => ({
  id,
  points: '1',
  description: '',
  frequency: 'one-time',
});

export default function PointManagementPage() {
  const [rows, setRows] = useState([createRow(1)]);

  const updateRow = (id, field, value) => {
    setRows((currentRows) => currentRows.map((row) => (
      row.id === id ? { ...row, [field]: value } : row
    )));
  };

  const addRow = () => {
    setRows((currentRows) => [
      ...currentRows,
      createRow(currentRows.length ? Math.max(...currentRows.map((row) => row.id)) + 1 : 1),
    ]);
  };

  return (
    <main className="point-management-page">
      <section className="point-management-page__intro">
        <p className="point-management-page__eyebrow">Point management</p>
        <h1>Add or remove points.</h1>
        <p>Record the reason for each point adjustment and choose whether it happens once or repeats.</p>
      </section>

      <section className="point-entry" aria-label="Point adjustments">
        <div className="point-entry__header" aria-hidden="true">
          <span>Points</span>
          <span>Description</span>
          <span>Frequency</span>
        </div>

        <div className="point-entry__rows">
          {rows.map((row, index) => (
            <div className="point-entry__row" key={row.id}>
              <label>
                <span className="point-entry__mobile-label">Points</span>
                <input
                  aria-label={`Points for adjustment ${index + 1}`}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={row.points}
                  onChange={(event) => updateRow(row.id, 'points', event.target.value.replace(/[^-\d]/g, ''))}
                />
              </label>
              <label>
                <span className="point-entry__mobile-label">Description</span>
                <input
                  aria-label={`Description for adjustment ${index + 1}`}
                  type="text"
                  placeholder="Why are points changing?"
                  value={row.description}
                  onChange={(event) => updateRow(row.id, 'description', event.target.value)}
                />
              </label>
              <fieldset className="point-entry__frequency">
                <legend>Frequency for adjustment {index + 1}</legend>
                <label className={row.frequency === 'one-time' ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name={`frequency-${row.id}`}
                    value="one-time"
                    checked={row.frequency === 'one-time'}
                    onChange={(event) => updateRow(row.id, 'frequency', event.target.value)}
                  />
                  One-time
                </label>
                <label className={row.frequency === 'recurring' ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name={`frequency-${row.id}`}
                    value="recurring"
                    checked={row.frequency === 'recurring'}
                    onChange={(event) => updateRow(row.id, 'frequency', event.target.value)}
                  />
                  Recurring
                </label>
              </fieldset>
            </div>
          ))}
        </div>

        <button className="point-entry__add" type="button" onClick={addRow}>
          <span aria-hidden="true">+</span> Add another row
        </button>
      </section>
    </main>
  );
}