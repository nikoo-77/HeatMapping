import React, { useState } from 'react';
import { Lock, KeyRound, ShieldCheck, X } from 'lucide-react';

type ChangePasswordModalProps = {
  open: boolean;
  username: string;
  /** When true, show Skip and suggest updating after first login */
  promptMode?: boolean;
  onClose: () => void;
  onSkip?: () => void;
  onSuccess?: () => void;
};

export default function ChangePasswordModal({
  open,
  username,
  promptMode = false,
  onClose,
  onSkip,
  onSuccess,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess(false);
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSkip = () => {
    resetForm();
    (onSkip ?? onClose)();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from your current password.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: username,
          currentPassword,
          newPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || 'Failed to update password.');
      }
      setSuccess(true);
      window.setTimeout(() => {
        resetForm();
        onSuccess?.();
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,15,40,0.55)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="relative w-full max-w-md bg-white rounded-[28px] shadow-[0_32px_80px_rgba(0,20,60,0.22)] overflow-hidden">
        <div className="bg-[#001f4b] px-6 py-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/10 p-2.5">
              {promptMode ? <ShieldCheck className="w-5 h-5 text-white" /> : <KeyRound className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p id="change-password-title" className="text-white font-black text-base tracking-[0.04em]">
                {promptMode ? 'Secure your account' : 'Change password'}
              </p>
              <p className="text-slate-300 text-xs mt-1 leading-5">
                {promptMode
                  ? 'You are still using the default password. Change it now to keep your account safe — or skip and do it later in Account Settings.'
                  : 'Update your login password. Changes are saved to your account in the database.'}
              </p>
            </div>
          </div>
          {!promptMode && (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full bg-white/10 hover:bg-white/20 p-2 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>

        <form className="p-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 block mb-1.5">
              Current password
            </span>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-[#001f4b] focus-within:bg-white">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none"
                placeholder="Enter current password"
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 block mb-1.5">
              New password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#001f4b] focus:bg-white"
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 block mb-1.5">
              Confirm new password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#001f4b] focus:bg-white"
              placeholder="Re-enter new password"
              required
              minLength={6}
            />
          </label>

          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-semibold">
              Password updated and saved to the database.
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            {promptMode ? (
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Skip for now
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving || success}
              className="rounded-xl bg-[#001f4b] hover:bg-[#00172f] px-6 py-2.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
            >
              {saving ? 'Saving…' : success ? 'Saved!' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
