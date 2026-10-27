// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import BulkUserUpload from '../../src/components/BulkUserUpload.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CSV = 'email,first_name,last_name,role,password\njane@example.com,Jane,Driver,driver,ChangeMe123\n';

const chooseFile = (contents = CSV) => {
  const file = new File([contents], 'users.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
};

it('uploads the chosen CSV and lists the users it created', async () => {
  const created = [{ row: 2, id: 41, email: 'jane@example.com', role: 'driver', firstName: 'Jane', lastName: 'Driver' }];
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ created, count: 1 }) });
  vi.stubGlobal('fetch', fetchMock);
  const onCreated = vi.fn();
  render(<BulkUserUpload onCreated={onCreated} />);

  expect(screen.getByRole('button', { name: 'Upload users' })).toBeDisabled();
  chooseFile();
  fireEvent.click(screen.getByRole('button', { name: 'Upload users' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Created 1 user:Jane Driver (jane@example.com): driver');
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/sponsor/users/bulk');
  expect(JSON.parse(options.body)).toEqual({ csv: CSV });
  expect(onCreated).toHaveBeenCalledWith(created);
  expect(screen.getByRole('button', { name: 'Upload users' })).toBeDisabled();
});

it('shows every rejected row and creates nothing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({
      message: 'No users were created. Fix the rows below and upload the file again.',
      errors: [
        { row: 3, email: 'bad-email', message: 'A first name, last name, valid email, and password are required.' },
        { row: 4, email: null, message: 'A first name, last name, valid email, and password are required.' },
      ],
    }),
  }));
  const onCreated = vi.fn();
  render(<BulkUserUpload onCreated={onCreated} />);

  chooseFile();
  fireEvent.click(screen.getByRole('button', { name: 'Upload users' }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('No users were created.');
  const rows = within(within(alert).getByRole('table', { name: 'Rows with problems' })).getAllByRole('row').slice(1);
  expect(rows.map((row) => [...row.cells].map((cell) => cell.textContent))).toEqual([
    ['3', 'bad-email', 'A first name, last name, valid email, and password are required.'],
    ['4', '(blank)', 'A first name, last name, valid email, and password are required.'],
  ]);
  expect(onCreated).not.toHaveBeenCalled();
});

it('offers a CSV template with the expected columns', () => {
  render(<BulkUserUpload />);

  const link = screen.getByRole('link', { name: 'Download template' });
  expect(link).toHaveAttribute('download', 'users-template.csv');
  expect(decodeURIComponent(link.getAttribute('href'))).toContain('email,first_name,last_name,role,password');
});
