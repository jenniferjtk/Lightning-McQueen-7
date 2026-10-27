// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PointChangeReportForm from '../../src/components/PointChangeReportForm.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('submits a report for the selected point change and confirms success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ reportId: 8 }),
  }));
  render(<PointChangeReportForm entry={{ id: 12 }} />);

  fireEvent.click(screen.getByRole('button', { name: 'Report point change' }));
  fireEvent.change(screen.getByLabelText('Why does this point change look suspicious?'), {
    target: { value: 'I did not receive these points.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Reported to admins');
  expect(fetch).toHaveBeenCalledWith('/api/point-change-reports', expect.objectContaining({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ pointLogId: 12, details: 'I did not receive these points.' }),
  }));
});

it('shows submission errors without marking the report as sent', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ message: 'You have already reported this point change.' }),
  }));
  render(<PointChangeReportForm entry={{ id: 12 }} />);

  fireEvent.click(screen.getByRole('button', { name: 'Report point change' }));
  fireEvent.change(screen.getByLabelText('Why does this point change look suspicious?'), {
    target: { value: 'I did not receive these points.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('You have already reported this point change.');
  expect(screen.queryByText('Reported to admins')).not.toBeInTheDocument();
});
