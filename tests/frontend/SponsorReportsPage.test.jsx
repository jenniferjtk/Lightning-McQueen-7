// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SponsorReportsPage from '../../src/components/SponsorReportsPage.jsx';

const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (createObjectUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', createObjectUrlDescriptor);
  else delete URL.createObjectURL;
  if (revokeObjectUrlDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
  else delete URL.revokeObjectURL;
});

const entries = [{
  driverId: 1,
  driverName: 'Dana Driver',
  totalPoints: 125,
  pointChange: 25,
  changeDate: '2026-10-12',
  sponsorName: 'Sam Sponsor',
  reason: 'Safe driving',
}];

it('shows driver point tracking with filters, totals, and CSV export', async () => {
  let downloadedFile = '';
  let capturedBlob;
  class CapturedBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
      capturedBlob = this;
    }
  }
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:report') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.stubGlobal('Blob', CapturedBlob);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloadedFile = this.download;
  });
  const fetchMock = vi.fn(async (url) => {
    if (url === '/api/admin/drivers') {
      return { ok: true, json: async () => ({ drivers: [{ id: 1, firstName: 'Dana', lastName: 'Driver' }] }) };
    }
    return { ok: true, json: async () => ({ entries }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<SponsorReportsPage user={{ role: 'admin' }} />);

  expect(await screen.findByRole('heading', { name: 'Sponsor Report' })).toBeInTheDocument();
  expect(await screen.findByText('Safe driving')).toBeInTheDocument();
  expect(screen.getByText('125 pts')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Driver' })).toHaveValue('all');
  const downloadButton = screen.getByRole('button', { name: 'Download CSV' });
  expect(downloadButton).toBeEnabled();
  fireEvent.click(downloadButton);
  expect(downloadedFile).toMatch(/^sponsor-point-report-.*\.csv$/);
  expect(capturedBlob.type).toBe('text/csv;charset=utf-8');
  expect(capturedBlob.parts[0]).toContain('"Driver Name","Total Points","Point Change"');
  expect(capturedBlob.parts[0]).toContain('"Dana Driver",125,25,"2026-10-12","Sam Sponsor","Safe driving"');

  fireEvent.change(screen.getByRole('combobox', { name: 'Driver' }), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'View report' }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/reports\/sponsor-points\?.*driverId=1/),
      { credentials: 'include' },
    );
  });
});
