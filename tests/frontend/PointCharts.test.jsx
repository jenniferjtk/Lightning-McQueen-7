// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  LOSSES_REFRESH_MS, POINTS_REFRESH_MS, PointsGainedChart, PointsLostChart, PointsTrendChart, SponsorWeeklyPointsChart,
} from '../../src/components/PointCharts.jsx';

const mockFetch = (status, body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
};

describe('point charts', () => {
  beforeAll(() => {
    // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    ['gains', PointsGainedChart, 'Where you earn the most points'],
    ['losses', PointsLostChart, 'Where you lose the most points'],
    ['trend', PointsTrendChart, 'Point total over time'],
  ])('the %s chart loads from its endpoint', async (kind, Chart, title) => {
    mockFetch(200, [{ reason: 'Safe driving week', total: 50, date: '2026-09-01', cumulative_total: 50 }]);

    render(<Chart />);

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/points/${kind}`, { credentials: 'include' });
    await screen.findByLabelText(title);
    expect(screen.queryByText('No point history yet.')).not.toBeInTheDocument();
  });

  it.each([PointsGainedChart, PointsLostChart, PointsTrendChart])('shows a message when there is no history', async (Chart) => {
    mockFetch(200, []);

    render(<Chart />);

    expect(await screen.findByText('No point history yet.')).toBeInTheDocument();
  });

  it('shows the API error message', async () => {
    mockFetch(500, { message: 'Unable to load your point history.' });

    render(<PointsGainedChart />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your point history.');
  });

  it('shows endpoint-specific errors for the earnings and trend charts', async () => {
    mockFetch(500, {});
    const { rerender } = render(<PointsGainedChart />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your points earned.');

    vi.mocked(fetch).mockClear();
    rerender(<PointsTrendChart />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your point history.');
    expect(fetch).toHaveBeenCalledWith('/api/points/trend', { credentials: 'include' });
  });

  it('re-fetches the losses chart on an interval and stops after unmount', async () => {
    vi.useFakeTimers();
    mockFetch(200, []);

    const { unmount } = render(<PointsLostChart />);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(LOSSES_REFRESH_MS); });
    expect(fetch).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(LOSSES_REFRESH_MS * 3); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['gains', PointsGainedChart],
    ['trend', PointsTrendChart],
  ])('re-fetches the %s chart and stops after unmount', async (_, Chart) => {
    vi.useFakeTimers();
    mockFetch(200, []);

    const { unmount } = render(<Chart />);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(POINTS_REFRESH_MS); });
    expect(fetch).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(POINTS_REFRESH_MS * 3); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('loads the sponsor aggregate chart from the weekly point changes endpoint', async () => {
    mockFetch(200, [
      { date: '2026-10-21', total: 0 },
      { date: '2026-10-22', total: 20 },
      { date: '2026-10-23', total: -5 },
      { date: '2026-10-24', total: 0 },
      { date: '2026-10-25', total: 15 },
      { date: '2026-10-26', total: 0 },
      { date: '2026-10-27', total: 10 },
    ]);

    render(<SponsorWeeklyPointsChart />);

    expect(screen.getByRole('heading', { name: 'Your drivers’ point changes over the last 7 days' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/sponsor/points/weekly', { credentials: 'include' });
    await screen.findByLabelText('Your drivers’ point changes over the last 7 days');
  });

  it('uses an organization-specific error when the sponsor endpoint fails without a message', async () => {
    mockFetch(500, {});

    render(<SponsorWeeklyPointsChart />);

    expect(await screen.findByRole('alert')).toHaveTextContent("Unable to load your drivers' point changes.");
    expect(fetch).toHaveBeenCalledWith('/api/sponsor/points/weekly', { credentials: 'include' });
  });
});
