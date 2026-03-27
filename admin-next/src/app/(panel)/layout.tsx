import Sidebar from '@/components/Sidebar';
import TopNav from '@/components/TopNav';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <TopNav />
      <Sidebar />
      <main className="ml-64 pt-16 p-8 min-h-screen">
        {children}
      </main>
    </div>
  );
}
