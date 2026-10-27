// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdminHomePage from '../../src/components/AdminHomePage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('links a sponsor account to an organization by user', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, options) => ({
    ok: true,
    json: async () => options?.method === 'PUT' ? { message: 'Sponsor account link saved.' } : {
      sponsors: [{ sponsor_id: 10, name: 'Acme Freight' }, { sponsor_id: 11, name: 'Blue Line' }],
      sponsorUsers: [{ user_id: 2, email: 'sam@example.com', first_name: 'Sam', last_name: 'Sponsor', sponsor_id: 10 }],
    },
  })));
  render(<AdminHomePage user={{ firstName: 'Ada' }} onPageChange={() => {}} />);
  const select = await screen.findByLabelText('Organization for Sam Sponsor');
  expect(select).toHaveValue('10');
  fireEvent.change(select, { target: { value: '11' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
  await screen.findByText('Sponsor account link saved.');
  expect(fetch).toHaveBeenLastCalledWith('/api/admin/sponsor-links/2', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ sponsorId: '11' }),
  }));
});
