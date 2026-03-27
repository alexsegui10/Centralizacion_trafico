import { SOURCE_COLORS, SOURCE_LABELS, sourceOf, fmtSince, shortId, initials, countryFlag } from '@/lib/flows';
import type { Lead } from '@/lib/types';

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
}

export default function LeadCard({ lead, onClick }: LeadCardProps) {
  const src = sourceOf(lead);
  const color = SOURCE_COLORS[src] ?? '#9ca3af';
  const flag = countryFlag(lead.pais);
  const geo = [flag + (lead.pais ?? ''), lead.ciudad].filter(Boolean).join(', ') || '-, -';
  const isConflict = String(lead.active_flow ?? '') === '6';

  return (
    <div
      onClick={onClick}
      className={`bg-surface-container-high p-4 cursor-pointer hover:bg-surface-bright transition-colors border border-transparent hover:border-outline-variant/20 group ${
        isConflict ? 'border-l-2 !border-l-error' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded flex items-center justify-center text-xs font-black text-surface flex-shrink-0 select-none"
          style={{ backgroundColor: color }}
        >
          {initials(lead.visitor_id)}
        </div>

        <div className="flex-1 min-w-0">
          {/* ID + badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs font-bold text-on-surface">{shortId(lead.visitor_id)}</span>
            {/* Source badge */}
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-surface"
              style={{ backgroundColor: color }}
            >
              {SOURCE_LABELS[src] ?? src}
            </span>
            {/* Conflict badge */}
            {isConflict && (
              <span className="material-symbols-outlined text-error text-sm" title="Conflicto">warning</span>
            )}
            {/* CupidBot badge */}
            {lead.cupidbot_activo && (
              <span className="material-symbols-outlined text-secondary text-sm" title="CupidBot activo">smart_toy</span>
            )}
          </div>

          {/* Geo */}
          <p className="text-[11px] text-on-surface-variant truncate mb-1">{geo}</p>

          {/* Time + device */}
          <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/60">
            <span className="material-symbols-outlined text-[12px]">{lead.dispositivo === 'mobile' ? 'smartphone' : lead.dispositivo === 'tablet' ? 'tablet' : 'computer'}</span>
            <span>{fmtSince(lead.updated_at ?? lead.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
