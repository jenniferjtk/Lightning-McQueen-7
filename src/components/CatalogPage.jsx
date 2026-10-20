import React, { useEffect, useState } from 'react';

export default function CatalogPage({ sponsors = [] }) {
  const [activeSponsorId, setActiveSponsorId] = useState(sponsors[0]?.id ?? null);

  useEffect(() => {
    if (!sponsors.some((sponsor) => sponsor.id === activeSponsorId)) {
      setActiveSponsorId(sponsors[0]?.id ?? null);
    }
  }, [activeSponsorId, sponsors]);

  const activeSponsor = sponsors.find((sponsor) => sponsor.id === activeSponsorId);

  return (
    <main className="catalog-page">
      <section className="catalog-page__intro">
        <p className="catalog-page__eyebrow">Rewards</p>
        <h1>Catalog</h1>
        <p>Browse rewards available from your sponsors and review your redemption history.</p>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-title">
        <div className="catalog-section__heading">
          <div>
            <p className="catalog-section__eyebrow">Redeem points</p>
            <h2 id="catalog-title">Sponsor catalog</h2>
          </div>
          {sponsors.length > 1 && (
            <div className="catalog-sponsor-tabs" role="tablist" aria-label="Choose sponsor catalog">
              {sponsors.map((sponsor) => (
                <button
                  key={sponsor.id}
                  id={`catalog-sponsor-tab-${sponsor.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeSponsorId === sponsor.id}
                  aria-controls="catalog-sponsor-panel"
                  className={activeSponsorId === sponsor.id ? 'catalog-sponsor-tabs__tab catalog-sponsor-tabs__tab--active' : 'catalog-sponsor-tabs__tab'}
                  onClick={() => setActiveSponsorId(sponsor.id)}
                >
                  {sponsor.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          id="catalog-sponsor-panel"
          className="catalog-empty"
          role={sponsors.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={sponsors.length > 1 ? `catalog-sponsor-tab-${activeSponsorId}` : undefined}
        >
          <span className="catalog-empty__mark" aria-hidden="true">{activeSponsor ? activeSponsor.name.slice(0, 1) : '★'}</span>
          <h3>{activeSponsor ? `${activeSponsor.name} rewards` : 'No sponsor catalogs yet'}</h3>
          <p>{activeSponsor ? 'Rewards from this sponsor will appear here when the catalog is available.' : 'Once a sponsor approves your application, their rewards catalog will appear here.'}</p>
        </div>
      </section>

      <section className="catalog-section catalog-orders" aria-labelledby="order-history-title">
        <div className="catalog-section__heading">
          <div>
            <p className="catalog-section__eyebrow">Your redemptions</p>
            <h2 id="order-history-title">Order history</h2>
          </div>
        </div>
        <div className="catalog-orders__empty">
          <h3>No orders yet</h3>
          <p>Items you redeem from a sponsor catalog will be listed here.</p>
        </div>
      </section>
    </main>
  );
}