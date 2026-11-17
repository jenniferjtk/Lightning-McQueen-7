// Formatting shared by the driver order history and the sponsor's driver
// orders page.
export const formatPrice = (price) => Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const formatPoints = (points) => `${Number(points).toLocaleString()} pts`;
export const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'canceled', label: 'Canceled' },
];
export const orderStatusLabel = (status) => ORDER_STATUSES.find((entry) => entry.value === status)?.label || status;
export const formatOrderDate = (value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// The order's calendar day in the viewer's time zone, as YYYY-MM-DD, so it
// compares directly with a date input's value.
export const orderDateKey = (value) => {
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// estimatedDelivery is a plain YYYY-MM-DD day from the server; build it as a
// local date so it doesn't shift by a day in time zones west of UTC.
export const formatDeliveryDate = (day) => {
  const [year, month, date] = String(day).split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const deliveryLabel = (order) => {
  if (order.status === 'delivered') return 'Delivered';
  if (order.status === 'canceled' || !order.estimatedDelivery) return '—';
  return `Arrives by ${formatDeliveryDate(order.estimatedDelivery)}`;
};
