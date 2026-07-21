import React from 'react';

type PersonAvatarProps = {
  name: string;
  avatarText?: string | null;
  profilePicture?: string | null;
  sizeClass?: string;
  textClass?: string;
  className?: string;
  roundedClass?: string;
  bgClass?: string;
  title?: string;
};

function initialsFrom(name: string, fallback?: string | null): string {
  if (fallback?.trim()) return fallback.trim().toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || '?').toUpperCase();
}

/** Circular avatar: real profile photo when available, otherwise initials. */
export default function PersonAvatar({
  name,
  avatarText,
  profilePicture,
  sizeClass = 'w-8 h-8',
  textClass = 'text-[11px]',
  className = '',
  roundedClass = 'rounded-full',
  bgClass = 'bg-[#002060] text-white',
  title,
}: PersonAvatarProps) {
  const initials = initialsFrom(name, avatarText);

  if (profilePicture) {
    return (
      <img
        src={profilePicture}
        alt={name}
        title={title ?? name}
        className={`${sizeClass} ${roundedClass} object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      title={title ?? name}
      className={`${sizeClass} ${roundedClass} ${bgClass} ${textClass} font-black flex items-center justify-center shrink-0 select-none ${className}`}
    >
      {initials}
    </span>
  );
}
