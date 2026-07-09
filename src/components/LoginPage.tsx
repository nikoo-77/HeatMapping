import React, { useState } from 'react';
import { ShieldCheck, Lock, UserRound, Sparkles } from 'lucide-react';

type LoginPageProps = {
  onLogin: (identifier: string, password: string) => void;
  error: string;
  isSubmitting: boolean;
  officialEmailHint?: string;
};

export default function LoginPage({ onLogin, error, isSubmitting, officialEmailHint }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onLogin(identifier.trim(), password);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(2,132,199,0.16),_transparent_30%),linear-gradient(135deg,_#f8fbff_0%,_#eef4ff_45%,_#f8fafc_100%)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-[#002060] px-8 py-10 text-white lg:px-10 lg:py-12">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-200">Crisis Intelligence</p>
                <h1 className="text-2xl font-black tracking-tight">HeatMapping Secure Access</h1>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-100">
                <Sparkles className="h-4 w-4" />
                Professional incident monitoring for your workforce
              </div>
              <ul className="mt-4 space-y-3 text-sm text-blue-50/90">
                <li>• Real-time employee safety visibility across regional operations</li>
                <li>• Admin-ready incident response and aid workflows</li>
                <li>• Secure access with role-based entry for official staff</li>
              </ul>
            </div>

            <div className="mt-8 space-y-3 text-sm text-blue-100/90">
              <div className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                <p className="font-semibold text-white">Official access</p>
                <p>Use an official email from Supabase · Password: 123456</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                <p className="font-semibold text-white">Manager access</p>
                <p>Username: manager · Password: manager123</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                <p className="font-semibold text-white">Administrator access</p>
                <p>Username: admin · Password: admin123</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-10 lg:px-10 lg:py-12">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Sign in</p>
              <h2 className="mt-2 text-3xl font-black text-slate-900">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter your credentials to access the disaster response dashboard and employee safety workspace.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block text-sm font-semibold text-slate-700">
                <span className="mb-2 block">Official email</span>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm focus-within:border-[#002060] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#002060]/20">
                  <UserRound className="h-4 w-4 text-slate-400" />
                  <input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none"
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                  />
                </div>
                {officialEmailHint ? (
                  <p className="mt-2 text-xs font-medium text-slate-500">Using Supabase email: {officialEmailHint}</p>
                ) : null}
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                <span className="mb-2 block">Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm focus-within:border-[#002060] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#002060]/20">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none"
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center rounded-2xl bg-[#002060] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#001848] disabled:cursor-not-allowed disabled:opacity-80"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
