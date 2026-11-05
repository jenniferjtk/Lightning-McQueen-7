// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdjustPointsForm from '../../src/components/AdjustPointsForm.jsx';

const rules = [
  { rule_id: 1, sponsor_id: 10, pt_value: 50, description: 'Safe driving week' },
  { rule_id: 2, sponsor_id: 10, pt_value: -30, description: 'Speeding alert' },
  { rule_id: 3, sponsor_id: 10, pt_value: 100, description: 'Safety bonus' },
  { rule_id: 4, sponsor_id: 10, pt_value: -125, description: 'Major violation' },
];

const mockFetch = (status, body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
};

describe('AdjustPointsForm', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists the sponsor's rules with their point values", () => {
    render(<AdjustPointsForm driverUserId={7} rules={rules} />);

    expect(screen.getByRole('option', { name: 'Safe driving week (+50 pts)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Speeding alert (-30 pts)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('applies the chosen rule and confirms it', async () => {
    mockFetch(201, { log_id: 1, driver_user_id: 7, rule_id: 2, reason: 'Speeding alert', change_amount: -30 });
    render(<AdjustPointsForm driverUserId={7} rules={rules} />);

    fireEvent.change(screen.getByLabelText('Point rule'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Comment (optional)'), { target: { value: 'Radar on I-85' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('status')).toHaveTextContent('-30 pts for Speeding alert');
    expect(fetch).toHaveBeenCalledWith('/api/points/apply', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ driverUserId: 7, ruleId: 2, comment: 'Radar on I-85' }),
    }));
    expect(screen.getByLabelText('Point rule')).toHaveValue('');
  });

  it('asks for confirmation before applying an adjustment of 100 points or more', async () => {
    mockFetch(201, { log_id: 2, driver_user_id: 7, rule_id: 4, reason: 'Major violation', change_amount: -125 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdjustPointsForm driverUserId={7} rules={rules} />);

    fireEvent.change(screen.getByLabelText('Point rule'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to remove 125 points?');
    expect(await screen.findByRole('status')).toHaveTextContent('-125 pts for Major violation');
  });

  it('does not apply a large adjustment when the sponsor cancels confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<AdjustPointsForm driverUserId={7} rules={rules} />);

    fireEvent.change(screen.getByLabelText('Point rule'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to add 100 points?');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the API error', async () => {
    mockFetch(403, { message: 'This driver is not in your sponsor program.' });
    render(<AdjustPointsForm driverUserId={7} rules={rules} />);

    fireEvent.change(screen.getByLabelText('Point rule'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This driver is not in your sponsor program.');
  });

  it('explains what to do when the sponsor has no rules', () => {
    render(<AdjustPointsForm driverUserId={7} rules={[]} />);

    expect(screen.getByText(/Create a point rule/)).toBeInTheDocument();
  });
});
