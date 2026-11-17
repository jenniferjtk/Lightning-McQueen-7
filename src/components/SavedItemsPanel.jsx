import React, { useEffect, useState } from 'react';
import { readFavorites } from '../utils/catalogFavorites.js';

export default function SavedItemsPanel({ sponsors = [], userId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const favoriteIds = readFavorites(userId);
    if (favoriteIds.size === 0 || sponsors.length === 0) {
      setItems([]);
      setError('');
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError('');
    Promise.all(sponsors.map(async (sponsor) => {
      try {
        const response = await fetch(`/api/sponsors/${sponsor.id}/catalog`, { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.products)) throw new Error('Unable to load saved items.');
        return data.products
          .filter((product) => favoriteIds.has(String(product.productId)))
          .map((product) => ({
            id: `${sponsor.id}:${product.productId}`,
            item: product.title,
            points: Number(product.pointCost || 0),
            sponsorName: sponsor.name,
          }));
      } catch {
        if (active) setError('Some saved items could not be loaded.');
        return [];
      }
    }))
      .then((catalogItems) => { if (active) setItems(catalogItems.flat()); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [sponsors, userId]);

  return (
    <section className="card saved-items-card" aria-label="Saved Items">
      <h2 className="card__title">Saved Items</h2>
      {loading ? (
        <p className="purchases-card__empty">Loading saved items...</p>
      ) : (
        <>
          {error && <p className="purchases-card__empty" role="status">{error}</p>}
          {items.length === 0 ? (
            <p className="purchases-card__empty">No saved items yet.</p>
          ) : (
            <ul className="saved-items-list">
              {items.map((item) => (
                <li key={item.id} className="saved-items-list__item">
                  <div>
                    <p className="saved-items-list__name">{item.item}</p>
                    <p className="saved-items-list__meta">Saved at {item.sponsorName}</p>
                  </div>
                  <span className="saved-items-list__points">{item.points.toLocaleString()} pts</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}