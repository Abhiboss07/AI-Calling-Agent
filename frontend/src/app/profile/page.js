'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Lock, Save, Shield, Upload, UserCircle2, X } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';

export default function ProfilePage() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name: user?.name || 'Estate Agent',
    email: user?.email || 'admin@estateagent.ai',
    phone: user?.phone || '+91 98XXXXXX10',
    title: user?.role || 'Operations Manager'
  });
  const [prefs, setPrefs] = useState({
    alerts: true,
    digest: true,
    darkShift: false
  });
  const [profileImage, setProfileImage] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('ea_profile');
      const savedPrefs = localStorage.getItem('ea_profile_prefs');
      const savedImage = localStorage.getItem('ea_profile_image');
      if (savedProfile) setForm((prev) => ({ ...prev, ...JSON.parse(savedProfile) }));
      if (savedPrefs) setPrefs((prev) => ({ ...prev, ...JSON.parse(savedPrefs) }));
      if (savedImage) setProfileImage(savedImage);
    } catch {
      // keep defaults
    }
  }, []);

  const onSave = () => {
    localStorage.setItem('ea_profile', JSON.stringify(form));
    localStorage.setItem('ea_profile_prefs', JSON.stringify(prefs));
    if (profileImage) {
      localStorage.setItem('ea_profile_image', profileImage);
    }
    window.dispatchEvent(new Event('ea-profile-updated'));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const onUploadImage = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const image = typeof reader.result === 'string' ? reader.result : '';
      if (!image) return;
      setProfileImage(image);
      localStorage.setItem('ea_profile_image', image);
      window.dispatchEvent(new Event('ea-profile-updated'));
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setProfileImage('');
    localStorage.removeItem('ea_profile_image');
    window.dispatchEvent(new Event('ea-profile-updated'));
  };

  return (
    <div className="profile-page">
      <section className="profile-hero fade-in-up">
        <div className="profile-avatar">
          {profileImage ? (
            <img src={profileImage} alt={form.name} className="profile-avatar-image" />
          ) : (
            <UserCircle2 size={52} />
          )}
        </div>
        <div>
          <p className="section-label">ACCOUNT SETTINGS</p>
          <h1 className="page-title" style={{ marginBottom: 6 }}>Profile & Preferences</h1>
          <p className="text-secondary">Manage identity, notifications, and security posture for your calling workspace.</p>
        </div>
      </section>

      <section className="profile-grid">
        <article className="card fade-in-up delay-1">
          <div className="panel-head">
            <h3>Personal Details</h3>
            <span className="badge"><Shield size={14} /> Verified</span>
          </div>
          <div className="form-grid">
            <div>
              <label>Full Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Job Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          <div className="action-row" style={{ marginTop: 10 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden-input"
              onChange={onUploadImage}
            />
            <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Upload Image
            </button>
            {profileImage && (
              <button className="btn btn-outline" onClick={removeImage}>
                <X size={14} /> Remove
              </button>
            )}
          </div>

          <div className="action-row">
            <button className="btn btn-primary" onClick={onSave}><Save size={14} /> Save Changes</button>
            {saved && <span className="save-toast">Saved successfully</span>}
          </div>
        </article>

        <article className="card fade-in-up delay-2">
          <div className="panel-head">
            <h3>Notification Preferences</h3>
            <span className="badge"><Bell size={14} /> Alerts</span>
          </div>
          <div className="toggle-stack">
            <ToggleRow
              label="Incident Alerts"
              desc="Notify immediately for call failures and downtime."
              checked={prefs.alerts}
              onChange={(v) => setPrefs({ ...prefs, alerts: v })}
            />
            <ToggleRow
              label="Daily Performance Digest"
              desc="Get a summary of calls, conversions, and quality trends."
              checked={prefs.digest}
              onChange={(v) => setPrefs({ ...prefs, digest: v })}
            />
            <ToggleRow
              label="Late-Night Quiet Mode"
              desc="Suppress non-critical notifications outside business hours."
              checked={prefs.darkShift}
              onChange={(v) => setPrefs({ ...prefs, darkShift: v })}
            />
          </div>
        </article>
      </section>

      <section className="card fade-in-up delay-3">
        <div className="panel-head">
          <h3>Security Controls</h3>
          <span className="badge"><Lock size={14} /> Protected</span>
        </div>
        <div className="security-grid">
          <div className="security-item">
            <h4>Password</h4>
            <p>Last changed 21 days ago</p>
            <button className="btn btn-outline" onClick={() => alert('Password rotation flow will be connected to backend auth settings.')}>Rotate Password</button>
          </div>
          <div className="security-item">
            <h4>Session Access</h4>
            <p>2 active sessions - last login from Chrome</p>
            <button className="btn btn-outline" onClick={() => alert('Session review panel will be connected to active token/session APIs.')}>Review Sessions</button>
          </div>
          <div className="security-item">
            <h4>Two-Factor Auth</h4>
            <p>Authenticator app enabled</p>
            <button className="btn btn-outline" onClick={() => alert('2FA management flow can be enabled once backend endpoints are available.')}>Manage 2FA</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="toggle-row">
      <div>
        <p className="toggle-title">{label}</p>
        <p className="toggle-desc">{desc}</p>
      </div>
      <button
        className={`toggle ${checked ? 'on' : 'off'}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span />
      </button>
    </div>
  );
}
