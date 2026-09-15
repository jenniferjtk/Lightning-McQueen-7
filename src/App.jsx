import React, { useEffect, useState } from 'react';
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
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) return <div className="state-screen">Checking your session...</div>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;

  const isAboutPage = window.location.pathname === '/about';

  return (
    <div className="app">
      <Navbar driverName={`${user.firstName} ${user.lastName}`} onLogout={() => setUser(null)} />

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
        body: JSON.stringify(form),
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
