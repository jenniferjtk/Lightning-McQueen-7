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