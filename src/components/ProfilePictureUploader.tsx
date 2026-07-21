import React, { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';

type ProfilePictureUploaderProps = {
  username: string;
  displayName: string;
  avatarText?: string;
  profilePicture: string | null;
  onUpdated: (url: string | null) => void;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (name.trim().slice(0, 2) || 'U').toUpperCase();
}

export default function ProfilePictureUploader({
  username,
  displayName,
  avatarText,
  profilePicture,
  onUpdated,
}: ProfilePictureUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const initials = avatarText?.trim() || initialsFrom(displayName || username);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setSuccess('');
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.type)) {
      setError('Only JPG, PNG, and WEBP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('identifier', username);
      formData.append('profilePicture', file);
      const res = await fetch('/api/account/profile-picture', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || 'Failed to upload profile picture.');
      }
      onUpdated(body.profilePicture ?? null);
      setSuccess('Profile picture saved to your account.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload profile picture.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setError('');
    setSuccess('');
    setUploading(true);
    try {
      const res = await fetch('/api/account/profile-picture', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: username }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || 'Failed to remove profile picture.');
      }
      onUpdated(null);
      setSuccess('Profile picture removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove profile picture.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Profile picture</p>
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative shrink-0">
          {profilePicture ? (
            <img
              src={profilePicture}
              alt={`${displayName} profile`}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow-sm"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#001f4b] text-lg font-black text-white shadow-sm">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-slate-600">
            Upload a square photo if possible. JPG, PNG, or WEBP up to 5MB. Saved to your account in the database.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#001f4b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#00172f] disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              {uploading ? 'Saving…' : profilePicture ? 'Change photo' : 'Upload photo'}
            </button>
            {profilePicture && (
              <button
                type="button"
                disabled={uploading}
                onClick={handleRemove}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {success && <p className="text-xs text-emerald-700 font-semibold">{success}</p>}
        </div>
      </div>
    </div>
  );
}
