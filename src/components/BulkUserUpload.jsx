import React, { useRef, useState } from 'react';

const TEMPLATE = [
  'email,first_name,last_name,role,password',
  'jane.driver@example.com,Jane,Driver,driver,ChangeMe123',
  'sam.sponsor@example.com,Sam,Sponsor,sponsor,ChangeMe123',
].join('\n');
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`${TEMPLATE}\n`)}`;

const readFileText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

// Lets a sponsor add up to 15 drivers and sponsor users for its own
// organization from a CSV. The server validates every row and creates either
// all of them or none, reporting each bad row.
export default function BulkUserUpload({ onCreated }) {
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const csv = await readFileText(file);
      const response = await fetch('/api/sponsor/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csv }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({ ok: false, message: data.message || 'Unable to upload these users.', errors: data.errors || [] });
        return;
      }
      setResult({ ok: true, created: data.created });
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      onCreated?.(data.created);
    } catch {
      setResult({ ok: false, message: 'Unable to upload these users. Check your connection and try again.', errors: [] });
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="card bulk-upload" aria-labelledby="bulk-upload-title">
      <div className="bulk-upload__heading">
        <div>
          <h2 id="bulk-upload-title" className="card__title">Add users from a file</h2>
          <p className="bulk-upload__hint">
            Upload a CSV with columns <code>email, first_name, last_name, role, password</code>. Role is
            {' '}<code>driver</code> or <code>sponsor</code>. Drivers join your program right away; sponsor users join
            your organization. Up to 15 users per file.
          </p>
        </div>
        <a className="bulk-upload__template" href={TEMPLATE_HREF} download="users-template.csv">Download template</a>
      </div>

      <form className="bulk-upload__form" onSubmit={upload}>
        <label>
          CSV file
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => { setFile(event.target.files?.[0] || null); setResult(null); }}
          />
        </label>
        <button type="submit" disabled={!file || uploading}>{uploading ? 'Uploading...' : 'Upload users'}</button>
      </form>

      {result?.ok && (
        <div className="bulk-upload__result" role="status">
          <p>Created {result.created.length} {result.created.length === 1 ? 'user' : 'users'}:</p>
          <ul>
            {result.created.map((user) => (
              <li key={user.id}>{user.firstName} {user.lastName} ({user.email}): {user.role}</li>
            ))}
          </ul>
        </div>
      )}

      {result && !result.ok && (
        <div className="bulk-upload__result bulk-upload__result--error" role="alert">
          <p>{result.message}</p>
          {result.errors.length > 0 && (
            <table className="driver-management__table" aria-label="Rows with problems">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Email</th>
                  <th scope="col">Problem</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((rowError) => (
                  <tr key={`${rowError.row}-${rowError.message}`}>
                    <td>{rowError.row}</td>
                    <td>{rowError.email || '(blank)'}</td>
                    <td>{rowError.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
