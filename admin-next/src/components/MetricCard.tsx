interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  badge?: string;
  badgeVariant?: 'green' | 'primary' | 'tertiary' | 'dim';
  sub?: string;
  accentLeft?: boolean;
}

const BADGE_CLASSES: Record<string, string> = {
  green:   'bg-secondary-container text-on-secondary-container',
  primary: 'bg-surface-bright text-on-surface',
  tertiary:'bg-tertiary-container text-on-tertiary-container',
  dim:     'bg-surface-container-highest text-on-surface-variant',
};

export default function MetricCard({
  icon, label, value, badge, badgeVariant = 'green', sub, accentLeft,
}: MetricCardProps) {
  return (
    <div className={`bg-surface-container-high p-6 relative overflow-hidden group ${accentLeft ? 'border-l-2 border-tertiary' : ''}`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors pointer-events-none" />
      <div className="flex flex-col relative">
        <span className="text-on-surface-variant text-xs font-medium mb-1 flex items-center gap-1 uppercase tracking-widest">
          <span className="material-symbols-outlined text-sm">{icon}</span>
          {label}
        </span>
        <span className="text-2xl font-black text-on-surface tabular-nums">{value}</span>
        {(badge || sub) && (
          <div className="mt-4 flex items-center gap-2">
            {badge && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${BADGE_CLASSES[badgeVariant]}`}>
                {badge}
              </span>
            )}
            {sub && <span className="text-[10px] text-on-surface-variant">{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
