import React from 'react';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PurchasesTable({ purchases }) {
  return (
    <section className="card purchases-card">
      <h2 className="card__title">Recent Purchases</h2>

      {purchases.length === 0 ? (
        <p className="purchases-card__empty">No redemptions yet — your history will show up here.</p>
      ) : (
        <table className="purchases-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Date</th>
              <th className="purchases-table__points-col">Points used</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.id}>
                <td>{purchase.item}</td>
                <td>{formatDate(purchase.date)}</td>
                <td className="purchases-table__points-col">
                  −{purchase.points.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
