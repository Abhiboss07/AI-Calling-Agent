'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Camera, Check, Key, Lock, Save, Shield, Upload, UserCircle2, X, MapPin, Mail, Phone, Globe, Calendar } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';

export default function ProfilePage() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const coverRef = useRef(null);
  const [form, setForm] = useState({
    name: 'Abhishek Yadav',
    email: 'abhicps19@gmail.com',
    phone: '+919580818926',
    title: 'Operations Manager',
    timezone: 'Asia/Kolkata',
    address: 'C/O: Awadhesh Yadav, 34, fatanpur, azamgarh',
    city: 'Azamgarh',
    state: 'Uttar Pradesh',
    zipCode: '223227',
    country: 'IN'
  });
  const [prefs, setPrefs] = useState({ alerts: true, digest: true, darkShift: false });
  const [profileImage, setProfileImage] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState('');

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('ea_profile');
      const savedPrefs = localStorage.getItem('ea_profile_prefs');
      const savedImage = localStorage.getItem('ea_profile_image');
      const savedCover = localStorage.getItem('ea_cover_image');
      if (savedProfile) setForm(prev => ({ ...prev, ...JSON.parse(savedProfile) }));
      if (savedPrefs) setPrefs(prev => ({ ...prev, ...JSON.parse(savedPrefs) }));
      if (savedImage) setProfileImage(savedImage);
      if (savedCover) setCoverImage(savedCover);
    } catch { /* defaults */ }
  }, []);

  const onSave = () => {
    localStorage.setItem('ea_profile', JSON.stringify(form));
    localStorage.setItem('ea_profile_prefs', JSON.stringify(prefs));
    if (profileImage) localStorage.setItem('ea_profile_image', profileImage);
    if (coverImage) localStorage.setItem('ea_cover_image', coverImage);
    window.dispatchEvent(new Event('ea-profile-updated'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleImageUpload = (event, type) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = typeof reader.result === 'string' ? reader.result : '';
      if (!img) return;
      if (type === 'profile') {
        setProfileImage(img);
        localStorage.setItem('ea_profile_image', img);
      } else {
        setCoverImage(img);
        localStorage.setItem('ea_cover_image', img);
      }
      window.dispatchEvent(new Event('ea-profile-updated'));
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (type) => {
    if (type === 'profile') {
      setProfileImage('');
      localStorage.removeItem('ea_profile_image');
    } else {
      setCoverImage('');
      localStorage.removeItem('ea_cover_image');
    }
    window.dispatchEvent(new Event('ea-profile-updated'));
  };

  const handlePasswordReset = () => {
    if (!passwordForm.current) { setPasswordMsg('Enter current password'); return; }
    if (passwordForm.newPass.length < 6) { setPasswordMsg('Min 6 characters'); return; }
    if (passwordForm.newPass !== passwordForm.confirm) { setPasswordMsg('Passwords don\'t match'); return; }
    setPasswordMsg('Password updated successfully!');
    setPasswordForm({ current: '', newPass: '', confirm: '' });
    setTimeout(() => setPasswordMsg(''), 3000);
  };

  const initials = form.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();

  const tabs = [
    { id: 'profile', label: 'User Profile' },
    { id: 'security', label: 'Security' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <div>
      {/* ── COVER PHOTO ── */}
      <div style={{
        height: 180, borderRadius: 'var(--radius-lg)', marginBottom: -60, position: 'relative', overflow: 'hidden',
        background: coverImage
          ? `url(${coverImage}) center/cover no-repeat`
          : 'linear-gradient(135deg, var(--accent), var(--accent-hover), #C2410C)'
      }}>
        <input ref={coverRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => handleImageUpload(e, 'cover')} />
        <button onClick={() => coverRef.current?.click()} style={{
          position: 'absolute', bottom: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: 12, fontWeight: 500,
          backdropFilter: 'blur(8px)'
        }}>
          <Camera size={14} /> Change Cover
        </button>
        {coverImage && (
          <button onClick={() => removeImage('cover')} style={{
            position: 'absolute', bottom: 12, right: 140, display: 'flex', alignItems: 'center',
            gap: 4, padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: 12
          }}>
            <X size={12} /> Remove
          </button>
        )}
      </div>

      {/* ── AVATAR + INFO ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, padding: '0 24px', marginBottom: 24, position: 'relative', zIndex: 2 }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%', border: '4px solid var(--bg-white)',
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 28, fontWeight: 700, overflow: 'hidden', boxShadow: 'var(--shadow-lg)'
          }}>
            {profileImage ? (
              <img src={profileImage} alt={form.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : initials}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handleImageUpload(e, 'profile')} />
          <button onClick={() => fileRef.current?.click()} style={{
            position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%',
            background: 'var(--accent)', border: '2px solid var(--bg-white)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
          }}>
            <Camera size={12} />
          </button>
        </div>
        <div style={{ paddingBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{form.name}</h2>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {form.email}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {form.phone}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Globe size={12} /> {form.timezone}</span>
          </div>
        </div>
      </div>

      {/* ── TAB NAV ── */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 24
      }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none',
            color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.2s'
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── PROFILE TAB ── */}
      {activeTab === 'profile' && (
        <div className="card-grid-2">
          {/* Basic Information */}
          <div className="card">
            <h3>Basic Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Job Title</label>
                <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <input style={inputStyle} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={onSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Save size={14} /> Save Changes
              </button>
              {saved && <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> Saved!</span>}
            </div>
          </div>

          {/* Address & Company */}
          <div className="card">
            <h3>Address & Company</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Address</label>
                <input style={inputStyle} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input style={inputStyle} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>ZIP Code</label>
                <input style={inputStyle} value={form.zipCode} onChange={e => setForm({ ...form, zipCode: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <input style={inputStyle} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-outline" onClick={onSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} /> Update Address
              </button>
            </div>
          </div>

          {/* Account Status */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h3>Account Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { label: 'Account Type', value: 'Standard', color: 'var(--text-primary)' },
                { label: 'Auth ID', value: 'MA_2LNXPSWI', color: 'var(--accent)' },
                { label: 'Status', value: 'Active', color: 'var(--success)' },
                { label: 'Email Verified', value: 'Yes', color: 'var(--success)' },
                { label: 'KYC Status', value: 'Verified', color: 'var(--success)' },
                { label: 'Last Login', value: new Date().toLocaleDateString(), color: 'var(--text-secondary)' },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: 16, borderRadius: 8, background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SECURITY TAB ── */}
      {activeTab === 'security' && (
        <div className="card-grid-2">
          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Key size={16} style={{ color: 'var(--accent)' }} /> Reset Password
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Current Password</label>
                <input type="password" style={inputStyle} value={passwordForm.current}
                  onChange={e => setPasswordForm({ ...passwordForm, current: e.target.value })}
                  placeholder="Enter current password" />
              </div>
              <div>
                <label style={labelStyle}>New Password</label>
                <input type="password" style={inputStyle} value={passwordForm.newPass}
                  onChange={e => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
                  placeholder="Enter new password (min 6 chars)" />
              </div>
              <div>
                <label style={labelStyle}>Confirm Password</label>
                <input type="password" style={inputStyle} value={passwordForm.confirm}
                  onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  placeholder="Confirm new password" />
              </div>
              <button className="btn btn-primary" onClick={handlePasswordReset}
                style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                <Lock size={14} /> Update Password
              </button>
              {passwordMsg && (
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: passwordMsg.includes('success') ? 'var(--success)' : 'var(--danger)'
                }}>
                  {passwordMsg}
                </span>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} style={{ color: 'var(--accent)' }} /> Security Settings
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Two-Factor Authentication', desc: 'Add an extra layer of security', status: 'Available' },
                { label: 'Session Management', desc: '2 active sessions', status: 'Active' },
                { label: 'API Key Rotation', desc: 'Last rotated 21 days ago', status: 'Due' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 16px', borderRadius: 8, background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
                  </div>
                  <span style={{
                    padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    background: item.status === 'Active' ? 'var(--success-light)' : 'var(--warning-light)',
                    color: item.status === 'Active' ? 'var(--success)' : 'var(--warning)'
                  }}>{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ── */}
      {activeTab === 'notifications' && (
        <div className="card">
          <h3>Notification Preferences</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <ToggleRow label="Incident Alerts" desc="Notify immediately for call failures and downtime."
              checked={prefs.alerts} onChange={v => setPrefs({ ...prefs, alerts: v })} />
            <ToggleRow label="Daily Performance Digest" desc="Get a summary of calls, conversions, and quality trends."
              checked={prefs.digest} onChange={v => setPrefs({ ...prefs, digest: v })} />
            <ToggleRow label="Late-Night Quiet Mode" desc="Suppress non-critical notifications outside business hours."
              checked={prefs.darkShift} onChange={v => setPrefs({ ...prefs, darkShift: v })} />
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={onSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Save size={14} /> Save Preferences
            </button>
            {saved && <span style={{ fontSize: 12, color: 'var(--success)', marginLeft: 12 }}>Saved!</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em'
};

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.2s'
};

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: '1px solid var(--border-light)'
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
        background: checked ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s'
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: 'white',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </button>
    </div>
  );
}
