'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { href: '/dashboard',  icon: 'dashboard',           label: 'Dashboard'  },
  { href: '/kanban',     icon: 'view_kanban',          label: 'Kanban'     },
  { href: '/statistics', icon: 'leaderboard',          label: 'Statistics' },
  { href: '/alerts',     icon: 'notifications_active', label: 'Alertas'    },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 z-50 bg-[#131318] flex flex-col py-6 text-sm font-medium">
      {/* Brand */}
      <div className="px-6 mb-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-lg fill-icon">bolt</span>
          </div>
          <span className="text-lg font-black text-[#f8f5fd]">Neon Noir</span>
        </div>
        <p className="text-[10px] uppercase tracking-widest text-[#acaab1] opacity-60">Executive Suite</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 py-3 px-6 transition-all duration-200 ${
                active
                  ? 'text-[#f8f5fd] bg-gradient-to-r from-[#b6a0ff]/20 to-transparent border-l-2 border-[#b6a0ff]'
                  : 'text-[#acaab1] hover:bg-[#19191f] hover:text-[#00e3fd] hover:translate-x-0.5'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-6 mt-auto border-t border-outline-variant/10 pt-4 space-y-1">
        <button
          onClick={logout}
          className="flex items-center gap-3 text-[#acaab1] py-2 hover:text-error transition-colors w-full text-sm"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Logout
        </button>
      </div>
    </aside>
  );
}
