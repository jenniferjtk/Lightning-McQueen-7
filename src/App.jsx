import React from 'react';
import Navbar from './components/Navbar.jsx';
import ProfileCard from './components/ProfileCard.jsx';
import PointsCard from './components/PointsCard.jsx';
import PurchasesTable from './components/PurchasesTable.jsx';
import AboutPage from './components/AboutPage.jsx';

const driver = {
  name: '',
  dateJoined: '',
  sponsorName: '',
  points: 0,
  recentPurchases: [],
};

export default function App() {
  const isAboutPage = window.location.pathname === '/about';

  return (
    <div className="app">
      <Navbar driverName={driver.name || 'Driver'} />

      {isAboutPage ? <AboutPage /> : <main className="dashboard">
        <div className="dashboard__top">
          <PointsCard points={driver.points} />
          <ProfileCard
            name={driver.name || '—'}
            dateJoined={driver.dateJoined || ''}
            sponsorName={driver.sponsorName || '—'}
          />
        </div>

        <PurchasesTable purchases={driver.recentPurchases} />
      </main>}
    </div>
  );
}
