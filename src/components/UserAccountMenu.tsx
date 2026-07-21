import React, { useEffect, useRef, useState } from 'react';
import { LogOut, ChevronDown, Settings } from 'lucide-react';

type UserAccountMenuProps = {
  displayName: string;
  username: string;
  roleLabel: string;
  avatarText?: string;
  avatarUrl?: string | null;
  onAccountSettings: () => void;
  onLogout: () => void;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || 'U').toUpperCase();
}

function AvatarBubble({
  sizeClass,
  textClass,
  initials,
  avatarUrl,
}: {
  sizeClass: string;
  textClass: string;
  initials: string;
  avatarUrl?: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${sizeClass} rounded-full object-cover shadow-sm ring-2 ring-white`}
      />
    );
  }
  return (
    <span
      className={`flex ${sizeClass} items-center justify-center rounded-full bg-[#002060] ${textClass} font-black text-white shadow-sm ring-2 ring-white`}
    >
      {initials}
    </span>
  );
}

export default function UserAccountMenu({
  displayName,
  username,
  roleLabel,
  avatarText,
  avatarUrl,
  onAccountSettings,
  onLogout,
}: UserAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const initials = avatarText?.trim() || initialsFrom(displayName || username);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="group flex items-center gap-1.5 rounded-full p-0.5 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]/30"
      >
        <AvatarBubble
          sizeClass="h-10 w-10"
          textClass="text-sm"
          initials={initials}
          avatarUrl={avatarUrl}
        />
        <ChevronDown
          className={`hidden sm:block h-4 w-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
        >
          <div className="border-b border-slate-100 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <AvatarBubble
                sizeClass="h-11 w-11"
                textClass="text-sm"
                initials={initials}
                avatarUrl={avatarUrl}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{username}</p>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {roleLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAccountSettings();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Settings className="h-4 w-4" />
              </span>
              Account Settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <LogOut className="h-4 w-4" />
              </span>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
