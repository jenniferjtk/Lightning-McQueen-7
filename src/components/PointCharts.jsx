import React, { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const POINTS_REFRESH_MS = 30000;
export const LOSSES_REFRESH_MS = POINTS_REFRESH_MS;

const GAIN_COLOR = '#1e7a46';
const LOSS_COLOR = '#b44738';
const TREND_COLOR = '#3A6EA5';
const SPONSOR_POINTS_ENDPOINT = '/api/sponsor/points/weekly';

// Loads a point history endpoint, optionally re-fetching every refreshMs.
// Keeps the last good data on screen if a background refresh fails.
function usePointData(url, refreshMs, fallbackError = 'Unable to load your point history.') {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = () => fetch(url, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || fallbackError);
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
  }, [url, refreshMs, fallbackError]);

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

function ReasonBarChart({ data, color, label }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="#E4E0D6" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="reason" width={150} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => [`${value.toLocaleString()} pts`, 'Total']} />
        <Bar dataKey="total" name={label} fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PointsGainedChart() {
  const { data, error } = usePointData('/api/points/gains', POINTS_REFRESH_MS, 'Unable to load your points earned.');
  return (
    <ChartCard title="Where you earn the most points" data={data} error={error}>
      <ReasonBarChart data={data} color={GAIN_COLOR} label="Points earned" />
    </ChartCard>
  );
}

export function PointsLostChart() {
  const { data, error } = usePointData('/api/points/losses', POINTS_REFRESH_MS, 'Unable to load your points lost.');
  return (
    <ChartCard title="Where you lose the most points" data={data} error={error}>
      <ReasonBarChart data={data} color={LOSS_COLOR} label="Points lost" />
    </ChartCard>
  );
}

export function PointsTrendChart({
  endpoint = '/api/points/trend',
  title = 'Point total over time',
  fallbackError = 'Unable to load your point history.',
} = {}) {
  const { data, error } = usePointData(endpoint, POINTS_REFRESH_MS, fallbackError);
  return (
    <ChartCard title={title} data={data} error={error}>
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

export function SponsorWeeklyPointsChart() {
  const { data, error } = usePointData(
    SPONSOR_POINTS_ENDPOINT,
    POINTS_REFRESH_MS,
    "Unable to load your drivers' point changes.",
  );
  return (
    <ChartCard title="Your drivers’ point changes over the last 7 days" data={data} error={error}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E4E0D6" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value, name) => [`${value > 0 ? '+' : ''}${value.toLocaleString()} pts`, name]} />
          <Legend />
          <ReferenceLine y={0} stroke="#5B6B79" />
          <Bar dataKey="gains" name="Points earned" fill={GAIN_COLOR} />
          <Bar dataKey="losses" name="Points lost" fill={LOSS_COLOR} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
