'use client';
import { useEffect, useState, useCallback } from 'react';
import MetricCard from './MetricCard';
import TrafficChart from './TrafficChart';
import FlowTable from './FlowTable';
import { getBrowserClient } from '@/lib/supabase-browser';
import { groupByFlow, groupBySource } from '@/lib/flows';
import type { Lead, DashboardMetrics, FlowId } from '@/lib/types';

interface Props { initial: DashboardMetrics; }

export default function DashboardClient({ initial }: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics>(initial);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const recompute = useCallback((leads: Lead[]) => {
    const flowGroups = groupByFlow(leads);
    const flowCounts = Object.fromEntries(
      Object.entries(flowGroups).map(([k, v]) => [k, v.length])
    ) as Record<FlowId, number>;

    setMetrics({
      totalLeads: leads.length,
      telegramActive: leads.filter(l => l.telegram_activo).length,
      ofActive: leads.filter(l => l.of_activo).length,
      cupidActive: leads.filter(l => l.cupidbot_activo).length,
      flowCounts,
      sourceStats: groupBySource(leads),
    });
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    let leads: Lead[] = [];

    // Initial fetch
    supabase.from('leads').select('*').then(({ data }) => {
      if (data) { leads = data as Lead[]; recompute(leads); }
    });

    // Realtime subscription
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, payload => {
        if (payload.eventType === 'INSERT') {
          leads = [...leads, payload.new as Lead];
        } else if (payload.eventType === 'UPDATE') {
          leads = leads.map(l => l.visitor_id === (payload.new as Lead).visitor_id ? payload.new as Lead : l);
        } else if (payload.eventType === 'DELETE') {
          leads = leads.filter(l => l.visitor_id !== (payload.old as Lead).visitor_id);
        }
        recompute(leads);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [recompute]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-on-surface mb-1">Executive Dashboard</h1>
          <p className="text-on-surface-variant text-sm">
            Métricas en tiempo real y análisis de flujos.
            <span className="ml-2 inline-flex items-center gap-1 text-green-400 text-[10px] uppercase font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live · {lastUpdated.toLocaleTimeString('es-ES')}
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-surface-container-high text-xs font-bold text-on-surface-variant hover:text-on-surface border border-outline-variant/20 rounded transition-all">
            Export Report
          </button>
          <button className="px-4 py-2 bg-primary text-on-primary-fixed text-xs font-bold rounded shadow-lg shadow-primary/10">
            Refresh Data
          </button>
        </div>
      </header>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon="person"
          label="Total usuarios"
          value={metrics.totalLeads.toLocaleString()}
          sub="en base de datos"
        />
        <MetricCard
          icon="send"
          label="Activos en Telegram"
          value={metrics.telegramActive.toLocaleString()}
          badge={metrics.totalLeads > 0 ? `${Math.round((metrics.telegramActive / metrics.totalLeads) * 100)}%` : '0%'}
          badgeVariant="green"
          sub="del total"
        />
        <MetricCard
          icon="star"
          label="OF Activo"
          value={metrics.ofActive.toLocaleString()}
          badge={metrics.totalLeads > 0 ? `${Math.round((metrics.ofActive / metrics.totalLeads) * 100)}%` : '0%'}
          badgeVariant="tertiary"
          sub="conversión"
          accentLeft
        />
        <MetricCard
          icon="smart_toy"
          label="CupidBot activo"
          value={metrics.cupidActive.toLocaleString()}
          badge={metrics.cupidActive > 0 ? 'En ejecución' : 'Inactivo'}
          badgeVariant="dim"
          sub="conversaciones vivas"
        />
      </div>

      {/* Chart */}
      <TrafficChart sourceStats={metrics.sourceStats} />

      {/* Flow table */}
      <FlowTable flowCounts={metrics.flowCounts} totalLeads={metrics.totalLeads} />
    </div>
  );
}
