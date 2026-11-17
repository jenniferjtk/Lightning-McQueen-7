// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import OrderForDriverPanel from '../../src/components/OrderForDriverPanel.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const product = { productId: 9, title: 'Hard Drive', price: 64, pointCost: 6400 };
const drivers = [
  { id: 1, name: 'Dana Driver', email: 'dana@example.com', hasShippingAddress: true, pointBalance: 7000 },
  { id: 4, name: 'Otto Other', email: 'otto@example.com', hasShippingAddress: true, pointBalance: 1000 },
  { id: 5, name: 'Nia Noaddress', email: 'nia@example.com', hasShippingAddress: false, pointBalance: 9000 },
];

const stubApi = (orderResponse) => vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => (
  url === '/api/sponsor/order-drivers'
    ? { ok: true, json: async () => ({ drivers }) }
    : orderResponse
)));

it('requires choosing a driver, then orders with their points', async () => {
  stubApi({
    ok: true,
    json: async () => ({
      order: { orderId: 77, productId: 9, pointCost: 6400, estimatedDelivery: '2026-11-24' },
      pointBalance: 600, stockQuantity: 2, driver: { id: 1, name: 'Dana Driver' },
    }),
  });
  const onOrdered = vi.fn();
  render(<OrderForDriverPanel product={product} onClose={vi.fn()} onOrdered={onOrdered} />);

  const select = await screen.findByLabelText('Driver');
  expect(screen.getByRole('button', { name: 'Choose a driver first' })).toBeDisabled();
  expect([...select.options].map((option) => option.textContent)).toEqual([
    'Choose a driver', 'Dana Driver (7,000 pts)', 'Otto Other (1,000 pts)', 'Nia Noaddress (9,000 pts) - no shipping address',
  ]);

  fireEvent.change(select, { target: { value: '1' } });
  expect(screen.getByText('Balance after').nextSibling).toHaveTextContent('600 pts');
  fireEvent.click(screen.getByRole('button', { name: 'Place order for Dana Driver' }));

  expect(await screen.findByText('Order #77 placed for Dana Driver.')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('6,400 pts came out of their balance, which is now 600 pts.');
  expect(fetch).toHaveBeenLastCalledWith('/api/sponsor/orders', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ driverId: 1, productId: 9, expectedPointCost: 6400 }),
  }));
  expect(onOrdered).toHaveBeenCalledWith(expect.objectContaining({ stockQuantity: 2 }));
});

it("won't order for a driver who can't afford it or has no address", async () => {
  stubApi();
  render(<OrderForDriverPanel product={product} onClose={vi.fn()} />);
  const select = await screen.findByLabelText('Driver');

  fireEvent.change(select, { target: { value: '4' } });
  expect(screen.getByText('Otto Other needs 5,400 pts more for this item.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Place order for Otto Other' })).toBeDisabled();

  fireEvent.change(select, { target: { value: '5' } });
  expect(screen.getByText(/Nia Noaddress hasn't saved a shipping address/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Place order for Nia Noaddress' })).toBeDisabled();
});

it('shows a new live price and waits for another confirmation', async () => {
  stubApi({ ok: false, json: async () => ({ code: 'PRICE_CHANGED', pointCost: 6500, message: 'The price changed to 6,500 points. Review the new cost and confirm again.' }) });
  render(<OrderForDriverPanel product={product} onClose={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Driver'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Place order for Dana Driver' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('The price changed to 6,500 points.');
  expect(screen.getByText('This item').nextSibling).toHaveTextContent('−6,500 pts');
  expect(screen.getByRole('button', { name: 'Place order for Dana Driver' })).toBeEnabled();
});

it('explains when there are no approved drivers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ drivers: [] }) }));
  render(<OrderForDriverPanel product={product} onClose={vi.fn()} />);
  expect(await screen.findByText('You have no approved drivers to order for yet.')).toBeInTheDocument();
});
