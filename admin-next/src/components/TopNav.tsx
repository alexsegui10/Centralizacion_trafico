'use client';
export default function TopNav() {
  return (
    <nav className="fixed top-0 w-full z-40 bg-[#0e0e13] shadow-[0px_24px_48px_rgba(0,0,0,0.5)] flex items-center justify-between px-6 h-16 text-sm tracking-tight border-none">
      <div className="flex items-center gap-8">
        <span className="text-xl font-bold tracking-tighter text-[#f8f5fd]">Admin Panel</span>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 text-[#acaab1] hover:text-[#f8f5fd] active:scale-95 duration-150 transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="p-2 text-[#acaab1] hover:text-[#f8f5fd] active:scale-95 duration-150 transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>
        <div className="w-8 h-8 rounded-full overflow-hidden ml-2 ring-1 ring-outline-variant/20 bg-gradient-to-br from-primary to-primary-dim flex items-center justify-center">
          <span className="material-symbols-outlined text-on-primary text-sm">person</span>
        </div>
      </div>
    </nav>
  );
}
