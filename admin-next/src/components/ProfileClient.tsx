'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FLOWS, inferFlow, fmtDate, fmtSince, countryFlag, sourceOf, SOURCE_COLORS, SOURCE_LABELS, shortId } from '@/lib/flows';
import ChatBox from './ChatBox';
import type { Lead, LeadEvent, LeadMessage, FlowId } from '@/lib/types';

interface Props {
  lead: Lead;
  events: LeadEvent[];
  messages: LeadMessage[];
}

type Action = 'activate_cupidbot' | 'pause_cupidbot' | 'mark_vip' | 'mark_conflict' | 'resolve_conflict' | 'set_flow';

const FLOW_IDS: FlowId[] = ['1', '2', '3', '4', '5', '6'];

function StatusBadge({ active, label, icon }: { active: boolean; label: string; icon: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-bold ${
      active
        ? 'bg-secondary/10 border-secondary/30 text-secondary'
        : 'bg-surface-container border-outline-variant/20 text-on-surface-variant/50'
    }`}>
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </div>
  );
}

export default function ProfileClient({ lead: initialLead, events, messages }: Props) {
  const [lead, setLead] = useState(initialLead);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<FlowId>(inferFlow(lead));
  useEffect(() => {
    setSelectedFlow(inferFlow(lead));
  }, [lead.active_flow, lead.of_activo, lead.mgo_directo, lead.mgo_en_canal, lead.telegram_activo]);
  const router = useRouter();

  const flag = countryFlag(lead.pais);
  const src = sourceOf(lead);
  const srcColor = SOURCE_COLORS[src] ?? '#9ca3af';
  const currentFlow = FLOWS[inferFlow(lead)];

  async function doAction(action: Action, flow?: FlowId) {
    setLoading(action);
    try {
      const res = await fetch(`/api/admin/leads/${lead.visitor_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, flow }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error');
      // Optimistic update
      const updates: Partial<Lead> = { updated_at: new Date().toISOString() };
      if (action === 'activate_cupidbot')   { updates.cupidbot_activo = true;  updates.cupidbot_pausado = false; }
      if (action === 'pause_cupidbot')      { updates.cupidbot_activo = false; updates.cupidbot_pausado = true;  }
      if (action === 'mark_vip')            { updates.of_activo = true; updates.active_flow = '4'; updates.cupidbot_activo = false; }
      if (action === 'mark_conflict')       { updates.active_flow = '6'; updates.cupidbot_activo = false; }
      if (action === 'resolve_conflict')    { updates.active_flow = null; }
      if (action === 'set_flow' && flow)    { updates.active_flow = flow; }
      setLead(prev => ({ ...prev, ...updates }));
      setToast({ msg: 'Actualizado correctamente', ok: true });
      router.refresh();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Error', ok: false });
    } finally {
      setLoading(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded text-sm font-bold border ${
          toast.ok
            ? 'bg-green-900/80 border-green-500/40 text-green-300'
            : 'bg-red-900/80 border-red-500/40 text-red-300'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded flex items-center justify-center text-base font-black text-surface"
            style={{ backgroundColor: srcColor }}
          >
            {lead.visitor_id.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-on-surface font-mono">
              {shortId(lead.visitor_id)}
            </h1>
            <p className="text-xs text-on-surface-variant font-mono">{lead.visitor_id}</p>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1 text-xs"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Volver
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: identity + status + actions */}
        <div className="lg:col-span-1 space-y-4">
          {/* Identity card */}
          <div className="bg-surface-container-high p-5 space-y-3">
            <h2 className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Identidad</h2>
            {[
              { icon: 'public',       label: 'País',       value: flag ? `${flag} ${lead.pais ?? '-'}` : (lead.pais ?? '-') },
              { icon: 'location_on',  label: 'Ciudad',     value: lead.ciudad ?? '-' },
              { icon: 'campaign',     label: 'Origen',     value: <span className="px-2 py-0.5 rounded text-[10px] font-bold text-surface" style={{ backgroundColor: srcColor }}>{SOURCE_LABELS[src] ?? src}</span> },
              { icon: 'smartphone',   label: 'Dispositivo',value: lead.dispositivo ?? '-' },
              { icon: 'translate',    label: 'Idioma',     value: (lead.idioma ?? '-').toUpperCase() },
              { icon: 'calendar_today',label:'Entrada',    value: fmtDate(lead.created_at) },
              { icon: 'timer',        label: 'En sistema', value: fmtSince(lead.created_at) },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-xs gap-2">
                <span className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm">{row.icon}</span>
                  {row.label}
                </span>
                <span className="text-on-surface font-medium text-right">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Status indicators */}
          <div className="bg-surface-container-high p-5 space-y-3">
            <h2 className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Estado</h2>
            <div className="grid grid-cols-2 gap-2">
              <StatusBadge active={!!lead.telegram_activo} label="Telegram"  icon="send" />
              <StatusBadge active={!!lead.of_activo}       label="OF Activo" icon="star" />
              <StatusBadge active={!!lead.mgo_directo}     label="MGO Dir."  icon="trending_up" />
              <StatusBadge active={!!lead.mgo_en_canal}    label="MGO Canal" icon="group" />
            </div>
            {/* Current flow */}
            <div className="flex items-center gap-2 px-3 py-2 rounded border text-xs font-bold border-outline-variant/20" style={{ borderLeftColor: currentFlow.color, borderLeftWidth: 2 }}>
              <span className="material-symbols-outlined text-sm" style={{ color: currentFlow.color }}>{currentFlow.icon}</span>
              <span className="text-on-surface">{currentFlow.name}</span>
            </div>
            {/* CupidBot */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-bold ${
              lead.cupidbot_activo
                ? 'bg-secondary/10 border-secondary/30 text-secondary'
                : lead.cupidbot_pausado
                ? 'bg-error/10 border-error/30 text-error'
                : 'bg-surface-container border-outline-variant/20 text-on-surface-variant/50'
            }`}>
              <span className="material-symbols-outlined text-sm">smart_toy</span>
              CupidBot {lead.cupidbot_activo ? 'Activo' : lead.cupidbot_pausado ? 'Pausado' : 'Inactivo'}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-surface-container-high p-5 space-y-3">
            <h2 className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Acciones</h2>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => doAction('activate_cupidbot')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-secondary/10 border border-secondary/30 text-secondary text-[10px] font-bold hover:bg-secondary/20 transition-colors disabled:opacity-40"
              >
                {loading === 'activate_cupidbot' ? '...' : <><span className="material-symbols-outlined text-xs">play_arrow</span> CupidBot</>}
              </button>
              <button
                onClick={() => doAction('pause_cupidbot')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-surface-container border border-outline-variant/20 text-on-surface-variant text-[10px] font-bold hover:text-on-surface transition-colors disabled:opacity-40"
              >
                {loading === 'pause_cupidbot' ? '...' : <><span className="material-symbols-outlined text-xs">pause</span> Pausar</>}
              </button>
              <button
                onClick={() => doAction('mark_vip')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-tertiary/10 border border-tertiary/30 text-tertiary text-[10px] font-bold hover:bg-tertiary/20 transition-colors disabled:opacity-40"
              >
                {loading === 'mark_vip' ? '...' : <><span className="material-symbols-outlined text-xs">star</span> VIP</>}
              </button>
              <button
                onClick={() => doAction('mark_conflict')}
                disabled={loading !== null}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-error/10 border border-error/30 text-error text-[10px] font-bold hover:bg-error/20 transition-colors disabled:opacity-40"
              >
                {loading === 'mark_conflict' ? '...' : <><span className="material-symbols-outlined text-xs">warning</span> Conflicto</>}
              </button>
            </div>

            {String(lead.active_flow ?? '') === '6' && (
              <button
                onClick={() => doAction('resolve_conflict')}
                disabled={loading !== null}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-bold hover:bg-green-500/20 transition-colors disabled:opacity-40"
              >
                {loading === 'resolve_conflict' ? '...' : <><span className="material-symbols-outlined text-xs">check_circle</span> Resolver conflicto</>}
              </button>
            )}

            {/* Flow selector */}
            <div className="flex gap-2">
              <select
                value={selectedFlow}
                onChange={e => setSelectedFlow(e.target.value as FlowId)}
                className="flex-1 bg-surface-container border border-outline-variant/20 text-on-surface text-xs px-2 py-2 focus:outline-none focus:border-primary/60"
              >
                {FLOW_IDS.map(id => (
                  <option key={id} value={id}>F{id} — {FLOWS[id].name}</option>
                ))}
              </select>
              <button
                onClick={() => doAction('set_flow', selectedFlow)}
                disabled={loading !== null}
                className="px-3 py-2 bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors disabled:opacity-40"
              >
                {loading === 'set_flow' ? '...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: timeline + chat */}
        <div className="lg:col-span-2 space-y-4">
          {/* Timeline */}
          <div className="bg-surface-container-high p-5">
            <h2 className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-4">Timeline de actividad</h2>
            {events.length === 0 ? (
              <p className="text-on-surface-variant/40 text-xs">Sin eventos registrados</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {events.map(ev => (
                  <div key={ev.request_id} className="flex items-start gap-3 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-on-surface capitalize">{ev.boton_clickado ?? 'evento'}</span>
                      <span className="text-on-surface-variant mx-2">·</span>
                      <span className="text-on-surface-variant truncate">{ev.utm_source ?? 'direct'}</span>
                      <span className="text-on-surface-variant mx-2">·</span>
                      <span className="text-on-surface-variant/60">{fmtDate(ev.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat */}
          <ChatBox visitorId={lead.visitor_id} initialMessages={messages} />
        </div>
      </div>
    </div>
  );
}
