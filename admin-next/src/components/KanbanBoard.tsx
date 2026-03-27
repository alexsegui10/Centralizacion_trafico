'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase-browser';
import { groupByFlow, FLOWS } from '@/lib/flows';
import LeadCard from './LeadCard';
import type { Lead, FlowId } from '@/lib/types';

interface Props { initialLeads: Lead[]; }

const FLOW_ORDER: FlowId[] = ['1', '2', '3', '4', '5', '6'];

export default function KanbanBoard({ initialLeads }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterCupid, setFilterCupid] = useState(false);
  const router = useRouter();

  const updateLead = useCallback((updated: Lead) => {
    setLeads(prev => prev.map(l => l.visitor_id === updated.visitor_id ? updated : l));
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();

    const channel = supabase
      .channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, payload => {
        if (payload.eventType === 'INSERT') {
          setLeads(prev => [payload.new as Lead, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          updateLead(payload.new as Lead);
        } else if (payload.eventType === 'DELETE') {
          setLeads(prev => prev.filter(l => l.visitor_id !== (payload.old as Lead).visitor_id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [updateLead]);

  const filtered = useMemo(() => {
    let out = leads;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(l =>
        l.visitor_id.toLowerCase().includes(q) ||
        (l.ciudad ?? '').toLowerCase().includes(q) ||
        (l.pais ?? '').toLowerCase().includes(q)
      );
    }
    if (filterSource) {
      out = out.filter(l => {
        const src = (l.utm_source ?? '').toLowerCase();
        if (filterSource === 'mgo') return l.mgo_directo || l.mgo_en_canal;
        return src.includes(filterSource);
      });
    }
    if (filterCupid) {
      out = out.filter(l => l.cupidbot_activo);
    }
    return out;
  }, [leads, search, filterSource, filterCupid]);

  const grouped = useMemo(() => groupByFlow(filtered), [filtered]);

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-on-surface mb-1">Kanban</h1>
          <p className="text-on-surface-variant text-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Realtime — {leads.length} usuarios
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID, ciudad..."
            className="bg-surface-container border border-outline-variant/20 text-on-surface text-xs px-3 py-2 w-48 focus:outline-none focus:border-primary/60"
          />
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="bg-surface-container border border-outline-variant/20 text-on-surface text-xs px-3 py-2 focus:outline-none focus:border-primary/60"
          >
            <option value="">Todos los orígenes</option>
            {['instagram', 'tiktok', 'x', 'reddit', 'mgo', 'direct'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => setFilterCupid(p => !p)}
            className={`px-3 py-2 text-xs font-bold border transition-colors flex items-center gap-1 ${
              filterCupid
                ? 'bg-secondary/20 border-secondary text-secondary'
                : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:text-secondary'
            }`}
          >
            <span className="material-symbols-outlined text-sm">smart_toy</span>
            CupidBot
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
        {FLOW_ORDER.map(flowId => {
          const flow = FLOWS[flowId];
          const column = grouped[flowId] ?? [];
          const isConflict = flowId === '6';

          return (
            <div key={flowId} className="flex flex-col min-h-32">
              {/* Column header */}
              <div className={`px-3 py-2 mb-2 flex items-center justify-between border-l-2`} style={{ borderColor: flow.color }}>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm" style={{ color: flow.color }}>{flow.icon}</span>
                  <span className="text-xs font-bold text-on-surface">{flow.name}</span>
                </div>
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-surface"
                  style={{ backgroundColor: flow.color }}
                >
                  {column.length}
                </span>
              </div>

              {/* Cards */}
              <div className={`space-y-2 ${isConflict && column.length > 0 ? 'ring-1 ring-error/30 p-1 rounded' : ''}`}>
                {column.length === 0 ? (
                  <div className="text-center py-6 text-on-surface-variant/30 text-[10px] uppercase tracking-widest">
                    Vacío
                  </div>
                ) : (
                  column.map(lead => (
                    <LeadCard
                      key={lead.visitor_id}
                      lead={lead}
                      onClick={() => router.push(`/profile/${lead.visitor_id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
