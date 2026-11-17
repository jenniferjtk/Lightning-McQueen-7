// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuditLogReport from '../../src/components/AuditLogReport.jsx';

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

it('filters audit events by category and date range', async () => {
  const entries = [{
    category: 'driver_application',
    date: '2026-10-12 10:30:00',
    sponsorName: 'Sam Sponsor',
    driverName: 'Dana Driver',
    driverId: 1,
    status: 'rejected',
    points: null,
    reason: 'Incomplete application',
  }];
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ entries }) }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuditLogReport />);

  expect(await screen.findByText('rejected')).toBeInTheDocument();
  expect(screen.getByText('Dana Driver')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Reason' })).not.toBeInTheDocument();
  expect(screen.queryByText('Incomplete application')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'All categories' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Audit log category' }), {
    target: { value: 'driver_application' },
  });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-31' } });
  fireEvent.click(screen.getByRole('button', { name: 'View audit log' }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/reports/audit-log?startDate=2026-10-01&endDate=2026-10-31&category=driver_application',
      { credentials: 'include' },
    );
  });
  expect(screen.queryByRole('columnheader', { name: 'Category' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: 'Audit log category' }), {
    target: { value: 'point_change' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'View audit log' }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/reports/audit-log?startDate=2026-10-01&endDate=2026-10-31&category=point_change',
      { credentials: 'include' },
    );
  });
  expect(screen.getByRole('columnheader', { name: 'Points' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
});

it('shows the sponsor user, not the organization, in point-change rows', async () => {
  const entries = [{
    category: 'point_change',
    date: '2026-10-12 10:30:00',
    sponsorName: 'Acme Trucking',
    sponsorUserName: 'Sam Sponsor',
    driverName: 'Dana Driver',
    driverId: 1,
    points: 12,
    reason: 'Safe driving',
  }];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ entries }) })));
  render(<AuditLogReport />);
  await screen.findByText('Loading audit log...');
  fireEvent.change(screen.getByRole('combobox', { name: 'Audit log category' }), {
    target: { value: 'point_change' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'View audit log' }));

  expect(await screen.findByText('Sam Sponsor')).toBeInTheDocument();
  expect(screen.queryByText('Acme Trucking')).not.toBeInTheDocument();
});

it('downloads a category-specific audit log CSV for the selected date range', async () => {
  let downloadedFile = '';
  let capturedBlob;
  class CapturedBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
      capturedBlob = this;
    }
  }
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:audit') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.stubGlobal('Blob', CapturedBlob);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloadedFile = this.download;
  });
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      entries: [{
        category: 'point_change',
        date: '2026-10-12 10:30:00',
        sponsorName: 'Acme Trucking',
        sponsorUserName: 'Sam Sponsor',
        driverName: 'Dana Driver',
        driverId: 1,
        points: 12,
        reason: '=SUM(1,1)',
      }],
    }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AuditLogReport />);

  await screen.findByText('Loading audit log...');
  fireEvent.change(screen.getByRole('combobox', { name: 'Audit log category' }), {
    target: { value: 'point_change' },
  });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-31' } });
  fireEvent.click(await screen.findByRole('button', { name: 'View audit log' }));
  const downloadButton = await screen.findByRole('button', { name: 'Download CSV' });
  await screen.findByText('Sam Sponsor');
  fireEvent.click(downloadButton);

  expect(downloadedFile).toBe('audit-log-point_change-2026-10-01-to-2026-10-31.csv');
  expect(capturedBlob.type).toBe('text/csv;charset=utf-8');
  expect(capturedBlob.parts[0]).toContain('"Date","Sponsor user","Driver","Points","Reason"');
  expect(capturedBlob.parts[0]).toContain('"Sam Sponsor"');
  expect(capturedBlob.parts[0]).toContain(`"'=SUM(1,1)"`);
  expect(capturedBlob.parts[0]).not.toContain('Acme Trucking');
});
