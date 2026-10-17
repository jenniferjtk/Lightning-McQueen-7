import React, { useEffect, useState } from 'react';

export default function AccountPage({ user, onProfileUpdate }) {
  const isDriver = user?.role === 'driver';
  const isSponsor = user?.role === 'sponsor';
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    sponsorName: user?.sponsorName || '',
    streetAddress: user?.streetAddress || '',
    city: user?.city || '',
    state: user?.state || '',
    zipCode: user?.zipCode || '',
    country: user?.country || 'United States',
  });
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('account');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [sponsorDrivers, setSponsorDrivers] = useState([]);
  const [sponsorDriversLoading, setSponsorDriversLoading] = useState(false);
  const [sponsorDriversError, setSponsorDriversError] = useState('');
  const [sponsorLinked, setSponsorLinked] = useState(true);

  useEffect(() => {
    setForm({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      sponsorName: user?.sponsorName || '',
      streetAddress: user?.streetAddress || '',
      city: user?.city || '',
      state: user?.state || '',
      zipCode: user?.zipCode || '',
      country: user?.country || 'United States',
    });
    setSaved(false);
  }, [user]);

  useEffect(() => {
    if (!isSponsor) return undefined;
    let cancelled = false;
    setSponsorDriversLoading(true);
    setSponsorDriversError('');
    fetch('/api/sponsor/drivers', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load drivers.');
        if (!cancelled) {
          setSponsorDrivers(data.drivers || []);
          setSponsorLinked(data.sponsorLinked);
        }
      })
      .catch((error) => {
        if (!cancelled) setSponsorDriversError(error.message);
      })
      .finally(() => {
        if (!cancelled) setSponsorDriversLoading(false);
      });
    return () => { cancelled = true; };
  }, [isSponsor]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submit = (event) => {
    event.preventDefault();
    const updatedUser = { ...user, ...form };
    onProfileUpdate(updatedUser);
    setSaved(true);
  };

  const updatePasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
    setPasswordMessage('');
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(true);
      setPasswordMessage('New passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to update your password.');
      setPasswordError(false);
      setPasswordMessage('Your password has been changed successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setPasswordError(true);
      setPasswordMessage(error.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <main className="account-page">
      <section className="account-card">
        <div className="account-card__header">
          <div>
            <p className="account-card__eyebrow">Edit account</p>
            <h1>{form.firstName || (isDriver ? 'Driver' : 'Account')} {form.lastName || ''}</h1>
          </div>
          <span className="account-card__badge">Active</span>
        </div>

        <div className="edit-account-form">
          {(isDriver || isSponsor) && <div className="account-tabs" role="tablist" aria-label="Account details">
            <button
              id="account-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'account'}
              aria-controls="account-panel"
              className={activeTab === 'account' ? 'account-tabs__tab account-tabs__tab--active' : 'account-tabs__tab'}
              onClick={() => setActiveTab('account')}
            >
              Account information
            </button>
            {isSponsor && <button
              id="sponsor-drivers-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'drivers'}
              aria-controls="sponsor-drivers-panel"
              className={activeTab === 'drivers' ? 'account-tabs__tab account-tabs__tab--active' : 'account-tabs__tab'}
              onClick={() => setActiveTab('drivers')}
            >
              Drivers
            </button>}
            {isDriver && <>
            <button
              id="shipping-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'shipping'}
              aria-controls="shipping-panel"
              className={activeTab === 'shipping' ? 'account-tabs__tab account-tabs__tab--active' : 'account-tabs__tab'}
              onClick={() => setActiveTab('shipping')}
            >
              Shipping address
            </button>
            <button
              id="points-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'points'}
              aria-controls="points-panel"
              className={activeTab === 'points' ? 'account-tabs__tab account-tabs__tab--active' : 'account-tabs__tab'}
              onClick={() => setActiveTab('points')}
            >
              Points
            </button>
            </>}
          </div>}

          <div
            id="account-panel"
            role={isDriver || isSponsor ? 'tabpanel' : undefined}
            aria-labelledby={isDriver || isSponsor ? 'account-tab' : undefined}
            hidden={(isDriver || isSponsor) && activeTab !== 'account'}
            className="edit-account-form__group"
          >
            <h2>Account information</h2>
            <div className="edit-account-form__row">
              <label>
                First name
                <input name="firstName" value={form.firstName} onChange={updateField} />
              </label>
              <label>
                Last name
                <input name="lastName" value={form.lastName} onChange={updateField} />
              </label>
            </div>

            <label>
              Email address
              <input type="email" name="email" value={form.email} onChange={updateField} />
            </label>

            <label>
              Phone number
              <input name="phone" value={form.phone} onChange={updateField} placeholder="(555) 123-4567" />
            </label>

            {isDriver && <label>
              Sponsor
              <input name="sponsorName" value={form.sponsorName} onChange={updateField} placeholder="Sponsor name" />
            </label>}

            <form className="password-change" onSubmit={changePassword}>
              <h3>Change password</h3>
              <label>
                Current password
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={updatePasswordField}
                  autoComplete="current-password"
                  required
                />
              </label>
              <div className="edit-account-form__row">
                <label>
                  New password
                  <input
                    type="password"
                    name="newPassword"
                    value={passwordForm.newPassword}
                    onChange={updatePasswordField}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    name="confirmPassword"
                    value={passwordForm.confirmPassword}
                    onChange={updatePasswordField}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              </div>
              {passwordMessage && (
                <p className={passwordError ? 'password-change__message password-change__message--error' : 'password-change__message password-change__message--success'} role={passwordError ? 'alert' : 'status'}>
                  {passwordMessage}
                </p>
              )}
              <button className="edit-account-form__submit" type="submit" disabled={passwordSaving}>
                {passwordSaving ? 'Updating password...' : 'Update password'}
              </button>
            </form>
          </div>

          {isDriver && <div
            id="shipping-panel"
            role="tabpanel"
            aria-labelledby="shipping-tab"
            hidden={activeTab !== 'shipping'}
            className="edit-account-form__group"
          >
            <h2>Shipping address</h2>
            <label>
              Street address
              <input name="streetAddress" value={form.streetAddress} onChange={updateField} placeholder="123 Main Street" />
            </label>

            <div className="edit-account-form__row">
              <label>
                City
                <input name="city" value={form.city} onChange={updateField} placeholder="Clemson" />
              </label>
              <label>
                State
                <input name="state" value={form.state} onChange={updateField} placeholder="SC" />
              </label>
            </div>

            <div className="edit-account-form__row">
              <label>
                ZIP code
                <input name="zipCode" value={form.zipCode} onChange={updateField} placeholder="29631" />
              </label>
              <label>
                Country
                <input name="country" value={form.country} onChange={updateField} placeholder="United States" />
              </label>
            </div>
          </div>}

          {isDriver && <section
            id="points-panel"
            role="tabpanel"
            aria-labelledby="points-tab"
            hidden={activeTab !== 'points'}
            className="edit-account-form__group account-points"
          >
            <h2>Points balance</h2>
            <p className="account-points__value" aria-label="Points balance unavailable">— <span>pts</span></p>
            <p className="account-points__message">Your points balance is not available yet.</p>
          </section>}

          {isSponsor && <section
            id="sponsor-drivers-panel"
            role="tabpanel"
            aria-labelledby="sponsor-drivers-tab"
            hidden={activeTab !== 'drivers'}
            className="edit-account-form__group"
          >
            <h2>Drivers</h2>
            {sponsorDriversLoading ? (
              <p>Loading drivers...</p>
            ) : sponsorDriversError ? (
              <p role="alert">{sponsorDriversError}</p>
            ) : !sponsorLinked ? (
              <p>This sponsor account is not linked to a sponsor organization yet.</p>
            ) : sponsorDrivers.length === 0 ? (
              <p>No approved drivers yet.</p>
            ) : (
              <div className="admin-driver-list__table-wrap">
                <table className="admin-driver-table">
                  <thead>
                    <tr><th scope="col">Driver</th><th scope="col">Email</th><th scope="col">Joined</th></tr>
                  </thead>
                  <tbody>
                    {sponsorDrivers.map((driver) => (
                      <tr key={driver.id}>
                        <td>{driver.firstName} {driver.lastName}</td>
                        <td>{driver.email}</td>
                        <td>{driver.createdAt ? new Date(driver.createdAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>}

          {saved && activeTab === 'account' && <p className="edit-account-form__success">Account updated.</p>}

          {activeTab === 'account' && (
            <div className="edit-account-form__actions">
              <button className="edit-account-form__submit" type="button" onClick={submit}>Save account</button>
              <a className="edit-account-form__secondary" href="/">Back to dashboard</a>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
