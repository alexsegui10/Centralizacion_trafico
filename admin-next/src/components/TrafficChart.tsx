'use client';
import { SOURCE_COLORS, SOURCE_LABELS } from '@/lib/flows';

interface SourceStat { total: number; telegram: number; of: number; }

interface TrafficChartProps {
  sourceStats: Record<string, SourceStat>;
}

const SOURCE_ORDER = ['instagram', 'tiktok', 'x', 'reddit', 'mgo', 'direct'];

export default function TrafficChart({ sourceStats }: TrafficChartProps) {
  const allSources = SOURCE_ORDER.filter(s => sourceStats[s]);
  const maxTotal = Math.max(...allSources.map(s => sourceStats[s]?.total ?? 0), 1);

  return (
    <div className="bg-surface-container p-6 rounded-lg">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-lg font-bold text-on-surface">Traffic Source Distribution</h2>
      </div>

      <div className="flex items-end justify-between h-48 gap-3 px-2 mb-4">
        {allSources.map(src => {
          const stat = sourceStats[src] ?? { total: 0, telegram: 0, of: 0 };
          const totalPct = Math.round((stat.total / maxTotal) * 100);
          const tgPct = stat.total > 0 ? Math.round((stat.telegram / stat.total) * 100) : 0;
          const ofPct = stat.total > 0 ? Math.round((stat.of / stat.total) * 100) : 0;
          const color = SOURCE_COLORS[src] ?? '#9ca3af';

          return (
            <div key={src} className="flex flex-col items-center flex-1 gap-2 group/bar" title={`${SOURCE_LABELS[src] ?? src}: ${stat.total} total`}>
              <span className="text-[9px] text-on-surface-variant font-bold tabular-nums opacity-0 group-hover/bar:opacity-100 transition-opacity">
                {stat.total}
              </span>
              <div
                className="w-full flex flex-col-reverse rounded-sm overflow-hidden bg-surface-container-low"
                style={{ height: `${Math.max(totalPct, 4)}%`, minHeight: '4px', maxHeight: '100%' }}
              >
                {/* Total base */}
                <div className="w-full flex-1 opacity-20" style={{ background: color }} />
                {/* Telegram layer */}
                {tgPct > 0 && (
                  <div className="w-full" style={{ height: `${tgPct}%`, background: color, opacity: 0.7 }} />
                )}
                {/* OF layer */}
                {ofPct > 0 && (
                  <div className="w-full" style={{ height: `${ofPct}%`, background: color }} />
                )}
              </div>
              <span className="text-[10px] text-on-surface-variant font-bold uppercase">
                {src === 'instagram' ? 'Insta' : src === 'direct' ? 'Direct' : SOURCE_LABELS[src] ?? src}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-2">
        {[
          { color: 'bg-on-surface-variant opacity-20', label: 'Total' },
          { color: 'bg-secondary opacity-70', label: 'Telegram' },
          { color: 'bg-primary', label: 'OF Activo' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${item.color}`} />
            <span className="text-[10px] text-on-surface-variant uppercase font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
