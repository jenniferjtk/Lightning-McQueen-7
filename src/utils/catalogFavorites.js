export const favoriteStorageKey = (userId) => `driver-catalog-favorites-${userId ?? 'guest'}`;

export function readFavorites(userId) {
  try {
    const stored = JSON.parse(localStorage.getItem(favoriteStorageKey(userId)) || '[]');
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch {
    return new Set();
  }
}