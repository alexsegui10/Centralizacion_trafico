import Link from 'next/link';
import { createServerClient } from '@/lib/supabase-server';
import { inferFlow, FLOWS, fmtSince, fmtDate, countryFlag, shortId, sourceOf, SOURCE_LABELS } from '@/lib/flows';
import type { Lead } from '@/lib/types';

export const dynamic = 'force-dynamic';

function AlertBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
      style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

interface AlertLead {
  lead: Lead;
  reasons: string[];
  severity: 'critical' | 'warning' | 'info';
}

const SEVERITY_COLORS = { critical: '#ff6e84', warning: '#f97316', info: '#b6a0ff' };
const SEVERITY_LABELS = { critical: 'Crítico', warning: 'Aviso', info: 'Info' };

function AlertRow({ item }: { item: AlertLead }) {
  const { lead, reasons, severity } = item;
  const color = SEVERITY_COLORS[severity];
  const flow = FLOWS[inferFlow(lead)];
  const src = sourceOf(lead);
  const srcLabel = SOURCE_LABELS[src] ?? src;
  const flag = countryFlag(lead.pais);

  return (
    <div
      className="bg-surface-container-high p-5 flex gap-4 items-start border"
      style={{ borderColor: `${color}30` }}
    >
      {/* Severity dot */}
      <div className="mt-1 flex-shrink-0">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <AlertBadge label={SEVERITY_LABELS[severity]} color={color} />
          <span className="text-xs font-mono text-[#acaab1]">{shortId(lead.visitor_id)}</span>
          <span className="text-xs" style={{ color: flow.color }}>F{flow.id} — {flow.name}</span>
          {flag && <span>{flag}</span>}
          {lead.ciudad && <span className="text-xs text-[#acaab1]">{lead.ciudad}</span>}
          <span className="text-xs text-[#acaab1]">{srcLabel}</span>
        </div>

        <ul className="space-y-1">
          {reasons.map((r, i) => (
            <li key={i} className="text-sm text-[#f8f5fd] flex items-start gap-2">
              <span className="material-symbols-outlined text-sm mt-0.5 flex-shrink-0" style={{ color }}>
                {severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info'}
              </span>
              {r}
            </li>
          ))}
        </ul>

        <div className="mt-2 text-xs text-[#acaab1]">
          Última actividad: {fmtSince(lead.updated_at ?? lead.created_at)} · Entrada: {fmtDate(lead.created_at)}
        </div>
      </div>

      {/* Link to profile */}
      <Link
        href={`/profile/${lead.visitor_id}`}
        className="flex-shrink-0 px-3 py-1.5 text-xs rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
      >
        Ver perfil
      </Link>
    </div>
  );
}

export default async function AlertsPage() {
  const supabase = createServerClient();
  const { data: leads } = await supabase.from('leads').select('*');
  const all: Lead[] = (leads ?? []) as Lead[];

  const alerts: AlertLead[] = [];

  for (const lead of all) {
    const reasons: string[] = [];
    let severity: AlertLead['severity'] = 'info';

    const flow = inferFlow(lead);
    const updatedMs = new Date(lead.updated_at ?? lead.created_at ?? Date.now()).getTime();
    const hoursSince = (Date.now() - updatedMs) / (1000 * 60 * 60);

    // Critical: conflict flow
    if (flow === '6') {
      reasons.push('Flujo en conflicto — requiere gestión manual');
      severity = 'critical';
    }

    // Critical: OF active but CupidBot also active (they shouldn't coexist)
    if (lead.of_activo && lead.cupidbot_activo) {
      reasons.push('OF activo con CupidBot activo — posible error de estado');
      severity = 'critical';
    }

    // Warning: Winback needed (MGO + 14 days inactive)
    if ((lead.mgo_directo || lead.mgo_en_canal) && !lead.winback_sent && hoursSince > 14 * 24) {
      reasons.push('Lead MGO sin actividad >14 días — Winback pendiente');
      if (severity !== 'critical') severity = 'warning';
    }

    // Warning: CupidBot paused for too long (>48h)
    if (lead.cupidbot_pausado && hoursSince > 48) {
      reasons.push('CupidBot pausado hace >48h — revisar si retomar');
      if (severity !== 'critical') severity = 'warning';
    }

    // Warning: Lead with Telegram active but no flow progress for >7 days
    if (lead.telegram_activo && !lead.mgo_directo && !lead.mgo_en_canal && !lead.of_activo && hoursSince > 7 * 24) {
      reasons.push('Telegram activo sin conversión >7 días — lead frío');
      if (severity !== 'critical') severity = 'warning';
    }

    // Info: No Telegram yet, lead older than 3 days
    if (!lead.telegram_activo && hoursSince > 3 * 24) {
      reasons.push('Sin Telegram tras >3 días — posible lead perdido');
    }

    if (reasons.length > 0) {
      alerts.push({ lead, reasons, severity });
    }
  }

  // Sort: critical first, then warning, then info; within each by recency
  const ORDER = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings  = alerts.filter(a => a.severity === 'warning');
  const infos     = alerts.filter(a => a.severity === 'info');

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-on-surface mb-1">Alertas</h1>
          <p className="text-on-surface-variant text-sm">{alerts.length} alertas activas</p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="flex items-center gap-1.5 text-error">
            <div className="w-2 h-2 rounded-full bg-error" />
            {critical.length} críticas
          </div>
          <div className="flex items-center gap-1.5 text-orange-400">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            {warnings.length} avisos
          </div>
          <div className="flex items-center gap-1.5 text-primary">
            <div className="w-2 h-2 rounded-full bg-primary" />
            {infos.length} info
          </div>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-green-500 mb-4">check_circle</span>
          <p className="text-lg font-bold text-[#f8f5fd]">Sin alertas activas</p>
          <p className="text-sm text-[#acaab1] mt-1">Todos los leads están en estado normal</p>
        </div>
      ) : (
        <div className="space-y-8">
          {critical.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: SEVERITY_COLORS.critical }}>
                Críticas ({critical.length})
              </h2>
              <div className="space-y-3">
                {critical.map(item => <AlertRow key={item.lead.visitor_id} item={item} />)}
              </div>
            </section>
          )}

          {warnings.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: SEVERITY_COLORS.warning }}>
                Avisos ({warnings.length})
              </h2>
              <div className="space-y-3">
                {warnings.map(item => <AlertRow key={item.lead.visitor_id} item={item} />)}
              </div>
            </section>
          )}

          {infos.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: SEVERITY_COLORS.info }}>
                Informativos ({infos.length})
              </h2>
              <div className="space-y-3">
                {infos.map(item => <AlertRow key={item.lead.visitor_id} item={item} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
