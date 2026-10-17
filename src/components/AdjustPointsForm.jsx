import React, { useState } from 'react';

const formatPoints = (value) => `${value > 0 ? '+' : ''}${value.toLocaleString()} pts`;

// Lets a sponsor apply one of its point rules to an approved driver. The
// server takes the amount and reason from the rule.
export default function AdjustPointsForm({ driverUserId, rules }) {
  const [ruleId, setRuleId] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  if (rules.length === 0) {
    return <p className="adjust-points__hint">Create a point rule to adjust this driver's points.</p>;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ type: '', message: '' });
    try {
      const response = await fetch('/api/points/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverUserId, ruleId: Number(ruleId), comment }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to apply the point rule.');
      setStatus({ type: 'success', message: `${formatPoints(data.change_amount)} for ${data.reason}` });
      setRuleId('');
      setComment('');
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="adjust-points" onSubmit={submit}>
      <select
        className="adjust-points__select"
        aria-label="Point rule"
        value={ruleId}
        onChange={(event) => setRuleId(event.target.value)}
        required
      >
        <option value="">Choose a rule...</option>
        {rules.map((rule) => (
          <option key={rule.rule_id} value={rule.rule_id}>
            {rule.description} ({formatPoints(Number(rule.pt_value))})
          </option>
        ))}
      </select>
      <input
        className="adjust-points__comment"
        aria-label="Comment (optional)"
        placeholder="Comment (optional)"
        maxLength={45}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      <button type="submit" className="applications-table__decide" disabled={submitting || !ruleId}>
        {submitting ? 'Applying...' : 'Apply'}
      </button>
      {status.message && (
        <p className={`adjust-points__status adjust-points__status--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>
          {status.message}
        </p>
      )}
    </form>
  );
}
