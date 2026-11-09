// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PointManagementPage from '../../src/components/PointManagementPage.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('switches point rules between a driver’s sponsors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ rules: [
      { rule_id: 1, sponsor_id: 10, pt_value: 25, description: 'Safe driving bonus', frequency: 'one-time' },
      { rule_id: 2, sponsor_id: 20, pt_value: 40, description: 'On-time delivery', frequency: 'recurring' },
    ] }),
  }));

  render(<PointManagementPage
    user={{ role: 'driver' }}
    sponsors={[{ id: 10, name: 'Acme Trucking' }, { id: 20, name: 'Roadrunner Logistics' }]}
  />);

  const tablist = await screen.findByRole('tablist', { name: 'Choose sponsor point rules' });
  const acmeTab = screen.getByRole('tab', { name: 'Acme Trucking' });
  const roadrunnerTab = screen.getByRole('tab', { name: 'Roadrunner Logistics' });

  expect(acmeTab).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByDisplayValue('Safe driving bonus')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('On-time delivery')).not.toBeInTheDocument();

  fireEvent.click(roadrunnerTab);

  expect(roadrunnerTab).toHaveAttribute('aria-selected', 'true');
  expect(acmeTab).toHaveAttribute('aria-selected', 'false');
  expect(screen.getByDisplayValue('On-time delivery')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Safe driving bonus')).not.toBeInTheDocument();
  expect(tablist).toHaveAttribute('role', 'tablist');
});

it('defaults new sponsor rules to the linked organization and locks the organization field', async () => {
  const fetchMock = vi.fn(async (_url, options = {}) => ({
    ok: true,
    status: options.method === 'POST' ? 201 : 200,
    json: async () => options.method === 'POST'
      ? { rule: { rule_id: 8, sponsor_id: 10, pt_value: 15, description: 'Safety bonus', frequency: 'one-time' } }
      : { rules: [{ rule_id: 7, sponsor_id: 10, pt_value: 25, description: 'Existing shared rule', frequency: 'one-time' }] },
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<PointManagementPage user={{ id: 2, role: 'sponsor', sponsorId: 10 }} />);

  expect(await screen.findByDisplayValue('Existing shared rule')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Add another rule/ }));
  const sponsorIdInput = screen.getByLabelText('Sponsor organization ID for rule 2');
  expect(sponsorIdInput).toHaveValue(10);
  expect(sponsorIdInput).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Points for adjustment 2'), { target: { value: '15' } });
  fireEvent.change(screen.getByLabelText('Description for adjustment 2'), { target: { value: 'Safety bonus' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));

  await screen.findByRole('status');
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(post[1].body)).toEqual({ sponsorId: 10, ptValue: 15, description: 'Safety bonus', frequency: 'one-time' });
});

it('shows only rules from the sponsor user linked organization', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ rules: [
      { rule_id: 1, sponsor_id: 1, pt_value: 999, description: 'Other organization rule', frequency: 'one-time' },
      { rule_id: 2, sponsor_id: 2, pt_value: 25, description: 'Roadrunner shared rule', frequency: 'recurring' },
    ] }),
  }));

  render(<PointManagementPage user={{ role: 'sponsor', sponsorId: 2 }} />);

  expect(await screen.findByDisplayValue('Roadrunner shared rule')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Other organization rule')).not.toBeInTheDocument();
});