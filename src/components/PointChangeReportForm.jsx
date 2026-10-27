import React, { useState } from 'react';

export default function PointChangeReportForm({ entry }) {
  const [isOpen, setIsOpen] = useState(false);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submitReport = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/point-change-reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pointLogId: entry.id, details: details.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to submit your report.');
      setSubmitted(true);
      setIsOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) return <span className="point-change-report__submitted" role="status">Reported to admins</span>;

  return (
    <div className="point-change-report">
      {!isOpen ? (
        <button type="button" className="point-change-report__toggle" onClick={() => setIsOpen(true)}>
          Report point change
        </button>
      ) : (
        <form className="point-change-report__form" onSubmit={submitReport}>
          <label>
            Why does this point change look suspicious?
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              required
              rows={3}
            />
          </label>
          <div className="point-change-report__actions">
            <button type="submit" disabled={isSubmitting || !details.trim()}>
              {isSubmitting ? 'Sending...' : 'Send report'}
            </button>
            <button type="button" disabled={isSubmitting} onClick={() => setIsOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="point-change-report__error" role="alert">{error}</p>}
    </div>
  );
}
