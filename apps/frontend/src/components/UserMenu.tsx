'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { LogOut, User as UserIcon, ShieldCheck, Crown, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export const UserMenu: React.FC = () => {
  const locale = useLocale();
  const { user, role, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const displayName = user.displayName || user.email?.split('@')[0] || 'Usuario';
  const photoUrl = user.photoURL;

  const getRoleBadge = () => {
    if (role === 'ADMIN') {
      return {
        label: 'ADMIN',
        icon: <ShieldCheck size={10} />,
        className: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      };
    }
    if (role === 'PRO_USER') {
      return {
        label: 'PRO',
        icon: <Crown size={10} />,
        className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      };
    }
    return {
      label: 'FREE',
      icon: <Sparkles size={10} />,
      className: 'bg-slate-800 text-slate-300 border-slate-700',
    };
  };

  const badge = getRoleBadge();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 pl-2.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-900 transition cursor-pointer"
      >
        {/* Role Badge */}
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 ${badge.className}`}>
          {badge.icon}
          {badge.label}
        </span>

        {/* User Avatar */}
        {photoUrl ? (
          <img src={photoUrl} alt={displayName} className="w-7 h-7 rounded-lg object-cover border border-slate-700" />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center font-bold text-xs">
            <UserIcon size={14} />
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-56 p-3 rounded-2xl border border-slate-800 bg-slate-950/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col gap-2.5 text-xs text-slate-200"
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="flex flex-col gap-0.5 pb-2 border-b border-slate-900">
            <span className="font-extrabold text-white truncate">{displayName}</span>
            <span className="text-[11px] text-slate-400 truncate">{user.email}</span>
          </div>

          <div className="flex justify-between items-center px-1">
            <span className="text-[11px] font-bold text-slate-400">{locale === 'es' ? 'Membresía:' : 'Plan:'}</span>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 ${badge.className}`}>
              {badge.icon}
              {badge.label}
            </span>
          </div>

          {role === 'ADMIN' && (
            <a
              href={`/${locale}/admin`}
              className="w-full py-1.5 px-2.5 rounded-xl border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-bold transition flex items-center gap-2 justify-center"
            >
              <ShieldCheck size={13} />
              <span>{locale === 'es' ? 'Panel Administrador' : 'Admin Panel'}</span>
            </a>
          )}


          <button
            onClick={() => {
              setIsOpen(false);
              logout();
            }}
            className="w-full mt-1 py-1.5 px-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold transition cursor-pointer flex items-center gap-2 justify-center"
          >
            <LogOut size={13} />
            <span>{locale === 'es' ? 'Cerrar Sesión' : 'Sign Out'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
