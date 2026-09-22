import React, { useEffect, useState } from 'react';

export default function AccountPage({ user, onProfileUpdate }) {
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

  return (
    <main className="account-page">
      <section className="account-card">
        <div className="account-card__header">
          <div>
            <p className="account-card__eyebrow">Edit account</p>
            <h1>{form.firstName || 'Driver'} {form.lastName || ''}</h1>
          </div>
          <span className="account-card__badge">Active</span>
        </div>

        <form className="edit-account-form" onSubmit={submit}>
          <div className="edit-account-form__group">
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

            <label>
              Sponsor
              <input name="sponsorName" value={form.sponsorName} onChange={updateField} placeholder="Sponsor name" />
            </label>
          </div>

          <div className="edit-account-form__group">
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
          </div>

          {saved && <p className="edit-account-form__success">Account updated.</p>}

          <div className="edit-account-form__actions">
            <button className="edit-account-form__submit" type="submit">Save account</button>
            <a className="edit-account-form__secondary" href="/">Back to dashboard</a>
          </div>
        </form>
      </section>
    </main>
  );
}
