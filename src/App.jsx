import React, { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import ProfileCard from './components/ProfileCard.jsx';
import PointsCard from './components/PointsCard.jsx';
import PurchasesTable from './components/PurchasesTable.jsx';
import AboutPage from './components/AboutPage.jsx';
import AccountPage from './components/AccountPage.jsx';
import PointManagementPage from './components/PointManagementPage.jsx';

const driver = {
  name: '',
  dateJoined: '',
  sponsorName: '',
  sponsor: null,
  points: 0,
  balanceNotifications: [],
  recentPurchases: [],
  savedItems: [],
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState('purchases');
  const [currentPage, setCurrentPage] = useState(() => {
    const pathname = window.location.pathname;
    if (pathname === '/about') return 'about';
    if (pathname === '/account') return 'account';
    if (pathname === '/points') return 'points';
    return 'dashboard';
  });

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    const pathMap = {
      dashboard: '/',
      about: '/about',
      account: '/account',
      points: '/points',
    };
    const path = pathMap[currentPage] || '/';
    window.history.pushState({}, '', path);
  }, [currentPage]);

  if (checkingSession) return <div className="state-screen">Checking your session...</div>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;

  const handleProfileUpdate = (updatedUser) => {
    setUser(updatedUser);
  };

  return (
    <div className="app">
      <Navbar
        driverName={`${user.firstName} ${user.lastName}`}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onLogout={() => {
          setUser(null);
          setCurrentPage('dashboard');
        }}
      />

      {currentPage === 'about' ? (
        <AboutPage />
      ) : currentPage === 'account' ? (
        <AccountPage user={user} onProfileUpdate={handleProfileUpdate} />
      ) : currentPage === 'points' ? (
        <PointManagementPage />
      ) : (
        <main className="dashboard">
          <div className="dashboard__top">
            <div className="dashboard__points-column">
              <PointsCard points={driver.points} />
              <section className="card points-activity-card">
                <h2 className="card__title">Recent point updates</h2>
                {driver.balanceNotifications.length === 0 ? (
                  <p className="points-activity-card__empty">No recent point changes yet.</p>
                ) : (
                  <ul className="points-activity-card__list">
                    {driver.balanceNotifications.map((entry) => (
                      <li key={entry.id} className="points-activity-card__item">
                        <div>
                          <p className="points-activity-card__label">{entry.label}</p>
                          <p className="points-activity-card__date">{entry.date}</p>
                        </div>
                        <span className={entry.amount >= 0 ? 'points-activity-card__amount points-activity-card__amount--positive' : 'points-activity-card__amount points-activity-card__amount--negative'}>
                          {entry.amount >= 0 ? '+' : '-'}{Math.abs(entry.amount).toLocaleString()} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="dashboard__profile-column">
              <ProfileCard
                name={driver.name || '—'}
                dateJoined={driver.dateJoined || ''}
                sponsorName={driver.sponsorName || '—'}
                sponsor={driver.sponsor}
              />

              <section className="card balance-notifications-card">
                <h2 className="card__title">Notifications</h2>

                {driver.balanceNotifications.length === 0 ? (
                  <p className="balance-notifications-card__empty">Your balance updates will appear here.</p>
                ) : (
                  <ul className="balance-notifications-card__list">
                    {driver.balanceNotifications.map((entry) => (
                      <li key={entry.id} className="balance-notifications-card__item">
                        <div>
                          <p className="balance-notifications-card__label">{entry.label}</p>
                          <p className="balance-notifications-card__date">{entry.date}</p>
                        </div>
                        <span className={entry.amount >= 0 ? 'balance-notifications-card__amount balance-notifications-card__amount--positive' : 'balance-notifications-card__amount balance-notifications-card__amount--negative'}>
                          {entry.amount >= 0 ? '+' : '-'}{Math.abs(entry.amount).toLocaleString()} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <section className="dashboard__panel">
            <div className="dashboard__tabs" aria-label="Dashboard sections">
              <button
                type="button"
                className={activeTab === 'purchases' ? 'dashboard__tab dashboard__tab--active' : 'dashboard__tab'}
                onClick={() => setActiveTab('purchases')}
              >
                Recent Purchases
              </button>
              <button
                type="button"
                className={activeTab === 'saved' ? 'dashboard__tab dashboard__tab--active' : 'dashboard__tab'}
                onClick={() => setActiveTab('saved')}
              >
                Saved Items
              </button>
            </div>

            {activeTab === 'purchases' ? (
              <PurchasesTable purchases={driver.recentPurchases} />
            ) : (
              <section className="card saved-items-card">
                <h2 className="card__title">Saved Items</h2>
                {driver.savedItems.length === 0 ? (
                  <p className="purchases-card__empty">No saved items yet.</p>
                ) : (
                  <ul className="saved-items-list">
                    {driver.savedItems.map((item) => (
                      <li key={item.id} className="saved-items-list__item">
                        <div>
                          <p className="saved-items-list__name">{item.item}</p>
                          <p className="saved-items-list__meta">Ready to redeem</p>
                        </div>
                        <span className="saved-items-list__points">{item.points.toLocaleString()} pts</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(isRegistering ? { ...form, role: 'driver' } : form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Something went wrong.');
      onAuthenticated(data.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const isRegistering = mode === 'register';
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-panel__brand"><span className="navbar__mark" aria-hidden="true" /> Lightning McQueen</div>
        <p className="auth-panel__eyebrow">Driver rewards portal</p>
        <h1>{isRegistering ? 'Create your account.' : 'Welcome back.'}</h1>
        <p className="auth-panel__intro">{isRegistering ? 'Join the team and start earning points.' : 'Sign in to view your points, profile, and purchases.'}</p>

        <form className="auth-form" onSubmit={submit}>
          {isRegistering && <div className="auth-form__row">
            <label>First name<input name="firstName" value={form.firstName} onChange={updateField} autoComplete="given-name" required /></label>
            <label>Last name<input name="lastName" value={form.lastName} onChange={updateField} autoComplete="family-name" required /></label>
          </div>}
          <label>Email address<input type="email" name="email" value={form.email} onChange={updateField} autoComplete="email" required /></label>
          <label>Password<input type="password" name="password" value={form.password} onChange={updateField} autoComplete={isRegistering ? 'new-password' : 'current-password'} required /></label>
          {error && <p className="auth-form__error" role="alert">{error}</p>}
          <button className="auth-form__submit" type="submit" disabled={loading}>{loading ? 'Please wait...' : isRegistering ? 'Create account' : 'Log in'}</button>
        </form>
        <button className="auth-form__switch" type="button" onClick={() => { setMode(isRegistering ? 'login' : 'register'); setError(''); }}>
          {isRegistering ? 'Already have an account? Log in' : 'No account yet? Register'}
        </button>
      </section>
    </main>
  );
}
