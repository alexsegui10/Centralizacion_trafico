'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError('Contraseña incorrecta');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary fill-icon">bolt</span>
          </div>
          <div>
            <p className="text-lg font-black text-on-surface">Neon Noir</p>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60">Executive Suite</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-surface-container-high p-8 shadow-2xl shadow-black/50">
          <h1 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-6">
            Acceso al panel
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant/20 text-on-surface px-4 py-3 text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-on-surface-variant/30"
                placeholder="••••••••"
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-error text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-gradient-to-r from-primary to-primary-dim text-on-primary-fixed font-bold py-3 text-sm hover:opacity-90 transition-opacity disabled:opacity-40 active:scale-[0.99]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-on-primary-fixed/30 border-t-on-primary-fixed rounded-full animate-spin" />
                  Accediendo...
                </span>
              ) : 'Acceder'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
