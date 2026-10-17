import React, { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

// How often the "Points lost" chart re-fetches (task 26693).
export const LOSSES_REFRESH_MS = 30000;

const GAIN_COLOR = '#1e7a46';
const LOSS_COLOR = '#b44738';
const TREND_COLOR = '#3A6EA5';

// Loads a point history endpoint, optionally re-fetching every refreshMs.
// Keeps the last good data on screen if a background refresh fails.
function usePointData(url, refreshMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = () => fetch(url, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'Unable to load your point history.');
        if (active) {
          setData(body);
          setError('');
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });

    load();
    const timer = refreshMs ? setInterval(load, refreshMs) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [url, refreshMs]);

  return { data, error };
}

function ChartCard({ title, data, error, children }) {
  let body;
  if (error && !data) body = <p className="point-chart-card__message" role="alert">{error}</p>;
  else if (!data) body = <p className="point-chart-card__message">Loading...</p>;
  else if (data.length === 0) body = <p className="point-chart-card__message">No point history yet.</p>;
  else body = <div className="point-chart-card__chart">{children}</div>;

  return (
    <section className="card point-chart-card" aria-label={title}>
      <h2 className="card__title">{title}</h2>
      {body}
    </section>
  );
}

function ReasonBarChart({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="#E4E0D6" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="reason" width={150} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => [`${value.toLocaleString()} pts`, 'Total']} />
        <Bar dataKey="total" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PointsGainedChart() {
  const { data, error } = usePointData('/api/points/gains');
  return (
    <ChartCard title="Where you earn the most points" data={data} error={error}>
      <ReasonBarChart data={data} color={GAIN_COLOR} />
    </ChartCard>
  );
}

export function PointsLostChart() {
  const { data, error } = usePointData('/api/points/losses', LOSSES_REFRESH_MS);
  return (
    <ChartCard title="Where you lose the most points" data={data} error={error}>
      <ReasonBarChart data={data} color={LOSS_COLOR} />
    </ChartCard>
  );
}

export function PointsTrendChart() {
  const { data, error } = usePointData('/api/points/trend');
  return (
    <ChartCard title="Point total over time" data={data} error={error}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E4E0D6" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => [`${value.toLocaleString()} pts`, 'Total']} />
          <Line type="monotone" dataKey="cumulative_total" stroke={TREND_COLOR} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
