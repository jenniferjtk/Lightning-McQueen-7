// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AboutPage from '../../src/components/AboutPage.jsx';

const mockFetch = (status, body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }));
};

describe('AboutPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the team, sprint, and release date from the API', async () => {
    mockFetch(200, { sprintNumber: 5, releaseDate: '10/07/2026' });

    render(<AboutPage />);

    expect(screen.getByText('Loading release details...')).toBeInTheDocument();
    expect(await screen.findByText('Team 07 | Sprint 05 | Released 10/07/2026')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/about');
  });

  it('shows the program features', () => {
    mockFetch(200, { sprintNumber: 5, releaseDate: '10/07/2026' });

    render(<AboutPage />);

    expect(screen.getByRole('heading', { name: 'Good Driver Incentive Program' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Earn points' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose your rewards' })).toBeInTheDocument();
  });

  it('shows the API error message', async () => {
    mockFetch(500, { message: 'Unable to load release details from the database.' });

    render(<AboutPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load release details from the database.');
  });

  it('handles a non-JSON response', async () => {
    mockFetch(502, '<html>Bad Gateway</html>');

    render(<AboutPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/unexpected response/);
  });
});
