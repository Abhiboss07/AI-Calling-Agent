'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { updateProfile, changePassword, updateAvatar, deleteAccount } from '../../lib/api';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const fileInputRef = useRef(null);

  const activeUser = user || { name: 'Admin', email: 'admin@vobiz.com', provider: 'local', phone: '' };

  // Profile Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ text: '', type: '' });

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });

  // Avatar config
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Delete config
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync user object to state when it loads
  useEffect(() => {
    if (activeUser) {
      setName(activeUser.name || '');
      setPhone(activeUser.phone || '');
    }
  }, [activeUser]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMsg({ text: '', type: '' });

    try {
      const res = await updateProfile({ name, phone });
      if (res.ok) {
        setProfileMsg({ text: 'Profile updated successfully! Refreshing...', type: 'success' });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setProfileMsg({ text: res.error || 'Failed to update profile', type: 'error' });
      }
    } catch (err) {
      setProfileMsg({ text: 'A network error occurred', type: 'error' });
    } finally {
      setIsUpdatingProfile(false);
      setTimeout(() => setProfileMsg({ text: '', type: '' }), 5000);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'New passwords do not match', type: 'error' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordMsg({ text: '', type: '' });

    try {
      const res = await changePassword({ currentPassword, newPassword });
      if (res.ok) {
        setPasswordMsg({ text: 'Password changed successfully! Please log in again.', type: 'success' });
        setTimeout(() => logout(), 2000);
      } else {
        setPasswordMsg({ text: res.error || 'Failed to change password', type: 'error' });
      }
    } catch (err) {
      setPasswordMsg({ text: 'A network error occurred', type: 'error' });
    } finally {
      setIsUpdatingPassword(false);
      setTimeout(() => setPasswordMsg({ text: '', type: '' }), 5000);
    }
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5MB");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const res = await updateAvatar(file);
      if (res.ok) {
        window.location.reload();
      } else {
        alert(res.error || "Failed to upload avatar");
      }
    } catch (err) {
      alert("Error connecting to server to upload avatar.");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteAccount();
      if (res.ok) {
        logout();
      } else {
        alert(res.error || 'Failed to delete account');
        setShowDeleteModal(false);
      }
    } catch (err) {
      alert('Network error while deleting account');
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const isGoogleUser = activeUser.provider === 'google';

  // UI Components
  const MessageToast = ({ msg }) => {
    if (!msg.text) return null;
    return (
      <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium mb-6 animate-in fade-in slide-in-from-top-2 ${msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
        <span className="material-symbols-outlined text-[20px]">
          {msg.type === 'success' ? 'check_circle' : 'error'}
        </span>
        {msg.text}
      </div>
    );
  };

  return (
    <div className="flex-1 max-w-[1024px] mx-auto w-full p-6 pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
          <span className="material-symbols-outlined text-4xl text-primary bg-primary/10 p-2 rounded-xl">account_circle</span>
          Profile Settings
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-3 sm:ml-[72px] text-base">Manage your account details, security credentials, and platform preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Avatar & Danger Zone */}
        <div className="space-y-6">

          {/* Avatar Section */}
          <div className="glass border border-slate-200 dark:border-slate-800/50 rounded-2xl p-6 text-center">
            <h2 className="font-bold text-slate-900 dark:text-white mb-6 text-lg">Profile Picture</h2>

            <div className="relative inline-block mb-6 group">
              <div className="w-32 h-32 rounded-full border-4 border-white dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 overflow-hidden flex items-center justify-center mx-auto shadow-xl relative transition-transform group-hover:scale-105 duration-300">
                {activeUser.avatar ? (
                  <img src={activeUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-black text-slate-400 dark:text-slate-500">{activeUser.name?.charAt(0).toUpperCase() || 'U'}</span>
                )}

                {/* Upload Overlay */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                >
                  <span className="material-symbols-outlined mb-1 text-2xl">photo_camera</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Change</span>
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarSelect}
                className="hidden"
                accept="image/png, image/jpeg, image/webp"
              />
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 border border-transparent dark:hover:border-slate-600 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">
                {isUploadingAvatar ? 'hourglass_empty' : 'upload'}
              </span>
              {isUploadingAvatar ? 'Uploading...' : 'Upload New Avatar'}
            </button>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 max-w-xs mx-auto mt-4 font-medium leading-relaxed">Allowed formats: JPEG, PNG or WEBP.<br />Maximum file size: 5MB.</p>
          </div>

          {/* Danger Zone */}
          <div className="bg-white dark:bg-slate-900 border border-rose-500/20 rounded-2xl p-6 shadow-sm shadow-rose-500/5 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
            <h2 className="font-bold text-rose-500 flex items-center gap-2 mb-3 text-lg relative z-10">
              <span className="material-symbols-outlined">warning</span>
              Danger Zone
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium leading-relaxed relative z-10">
              Deleting your account is permanent. This action instantly removes all your data, call history, and active agents.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full px-4 py-3 bg-rose-500/10 hover:bg-rose-500 text-rose-600 dark:text-rose-400 hover:text-white rounded-xl text-sm font-bold transition-all relative z-10 group-hover:border-rose-500/50 border border-transparent"
            >
              Delete Account
            </button>
            <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-9xl text-rose-500/5 transform rotate-12 transition-transform group-hover:scale-110 duration-500">delete_forever</span>
          </div>

        </div>

        {/* Right Column: Forms */}
        <div className="lg:col-span-2 space-y-6">

          {/* Personal Info */}
          <div className="glass border border-slate-200 dark:border-slate-800/50 rounded-2xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-8">Personal Details</h2>

            <MessageToast msg={profileMsg} />

            <form onSubmit={handleProfileSubmit} className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">person</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl py-3 pl-12 pr-4 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-slate-400"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400/50 text-[20px]">mail</span>
                    <input
                      type="email"
                      value={activeUser.email}
                      disabled
                      className="w-full bg-slate-100 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800/50 rounded-xl py-3 pl-12 pr-4 text-sm font-medium text-slate-500 cursor-not-allowed opacity-70"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-2 ml-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">lock</span>
                    Email is tied to your billing identity.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">phone</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl py-3 pl-12 pr-4 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-slate-400"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  {activeUser.phone && !activeUser.phoneVerified && (
                    <div className="mt-3 ml-1 flex items-start sm:items-center gap-2 text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 py-2 px-3 rounded-lg border border-yellow-500/20 inline-flex">
                      <span className="material-symbols-outlined text-[18px]">verified_user</span>
                      <span className="text-xs font-bold font-medium leading-tight">Phone number requires verification for SMS alerts.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  className="px-8 py-3 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
                >
                  {isUpdatingProfile ? (
                    <><span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> Saving changes...</>
                  ) : (
                    'Save Profile Changes'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Security / Change Password */}
          <div className="glass border border-slate-200 dark:border-slate-800/50 rounded-2xl p-6 md:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-8 flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-400">shield_lock</span>
              Security & Authentication
            </h2>

            {isGoogleUser && !activeUser.password ? (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col sm:flex-row items-start gap-4">
                <div className="bg-white dark:bg-slate-800 p-2 rounded-full shadow-sm">
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2">Google Login Active</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">You are authenticated via Google Workspace. You do not have a standard password set. To utilize email and password login in the future, please invoke the reset password flow from the login page.</p>
                </div>
              </div>
            ) : (
              <>
                <MessageToast msg={passwordMsg} />
                <form onSubmit={handlePasswordSubmit} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl py-3 px-4 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-slate-400"
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl py-3 px-4 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-slate-400"
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl py-3 px-4 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-slate-400"
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="md:col-span-2 pt-2">
                      <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-lg p-3">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Password Requirements</h4>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                          <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-emerald-500">check</span> Minimum 8 characters</li>
                          <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">remove</span> 1 uppercase letter</li>
                          <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">remove</span> 1 special character</li>
                          <li className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">remove</span> 1 number</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="px-8 py-3 bg-slate-800 hover:bg-slate-900 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isUpdatingPassword ? (
                        <><span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> Updating Security...</>
                      ) : (
                        'Update Password'
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-6 mx-auto">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3 text-center tracking-tight">Erase Reality</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed text-center">
              This is the event horizon. Deleting your account irrecoverably destroys all data, configurations, unspent credits, and analytics.
            </p>

            <div className="flex flex-col-reverse sm:flex-row justify-center gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="w-full sm:w-auto px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Keep my account
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="w-full sm:w-auto px-6 py-3 bg-rose-500 hover:bg-rose-600 border border-transparent hover:border-rose-400/50 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isDeleting ? (
                  <><span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> Deleting...</>
                ) : (
                  'Yes, delete everything'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
