import { createServerClient } from '@/lib/supabase-server';
import { groupByFlow, groupBySource, FLOWS, SOURCE_LABELS, SOURCE_COLORS } from '@/lib/flows';
import type { Lead, FlowId } from '@/lib/types';

export const dynamic = 'force-dynamic';

function pct(n: number, total: number) {
  if (!total) return '0%';
  return ((n / total) * 100).toFixed(1) + '%';
}

export default async function StatisticsPage() {
  const supabase = createServerClient();
  const { data: leads } = await supabase.from('leads').select('*').limit(1000);
  const all: Lead[] = (leads ?? []) as Lead[];

  const total = all.length;
  const flowGroups = groupByFlow(all);
  const sourceStats = groupBySource(all);

  // Device breakdown
  const devices: Record<string, number> = {};
  for (const l of all) {
    const d = (l.dispositivo ?? 'unknown').toLowerCase();
    devices[d] = (devices[d] ?? 0) + 1;
  }

  // Language breakdown
  const langs: Record<string, number> = {};
  for (const l of all) {
    const lg = (l.idioma ?? 'unknown').toLowerCase();
    langs[lg] = (langs[lg] ?? 0) + 1;
  }
  const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Country breakdown
  const countries: Record<string, number> = {};
  for (const l of all) {
    const c = (l.pais ?? 'Unknown');
    countries[c] = (countries[c] ?? 0) + 1;
  }
  const topCountries = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Conversion funnel
  const telegramCount = all.filter(l => l.telegram_activo).length;
  const ofCount = all.filter(l => l.of_activo).length;
  const mgoCount = all.filter(l => l.mgo_directo || l.mgo_en_canal).length;
  const cupidCount = all.filter(l => l.cupidbot_activo).length;

  const FLOW_ORDER: FlowId[] = ['1', '2', '3', '4', '5', '6'];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tighter text-on-surface mb-1">Estadísticas</h1>
        <p className="text-on-surface-variant text-sm">{total} leads en base de datos</p>
      </div>

      {/* Conversion Funnel */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Embudo de Conversión</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Leads',     value: total,         icon: 'person_add',       color: '#b6a0ff' },
            { label: 'Telegram activo', value: telegramCount, icon: 'send',             color: '#00e3fd' },
            { label: 'MGO activado',    value: mgoCount,      icon: 'trending_up',      color: '#22c55e' },
            { label: 'OF activo',       value: ofCount,       icon: 'star',             color: '#ff6c95' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface-container-high p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-lg" style={{ color: stat.color }}>{stat.icon}</span>
                <span className="text-xs text-on-surface-variant">{stat.label}</span>
              </div>
              <div className="text-3xl font-black" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs text-on-surface-variant mt-1">{pct(stat.value, total)} del total</div>
            </div>
          ))}
        </div>
      </section>

      {/* Flow Distribution */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Distribución por Flujo</h2>
        <div className="bg-surface-container-high overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 text-xs text-on-surface-variant uppercase tracking-wider">
                <th className="text-left px-5 py-3">Flujo</th>
                <th className="text-left px-5 py-3">Descripción</th>
                <th className="text-right px-5 py-3">Leads</th>
                <th className="text-right px-5 py-3">%</th>
                <th className="px-5 py-3 w-40">Barra</th>
              </tr>
            </thead>
            <tbody>
              {FLOW_ORDER.map(fid => {
                const flow = FLOWS[fid];
                const count = flowGroups[fid].length;
                const pctVal = total ? (count / total) * 100 : 0;
                return (
                  <tr key={fid} className="border-b border-outline-variant/5 hover:bg-[#19191f] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm" style={{ color: flow.color }}>{flow.icon}</span>
                        <span className="font-semibold" style={{ color: flow.color }}>F{fid} — {flow.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-on-surface-variant text-xs">{flow.description}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-on-surface">{count}</td>
                    <td className="px-5 py-3 text-right text-on-surface-variant">{pctVal.toFixed(1)}%</td>
                    <td className="px-5 py-3">
                      <div className="h-2 bg-surface-container-lowest rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pctVal}%`, backgroundColor: flow.color }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Source Stats */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Fuentes de Tráfico</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(sourceStats)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([src, stats]) => {
              const color = SOURCE_COLORS[src] ?? '#9ca3af';
              const label = SOURCE_LABELS[src] ?? src;
              const telPct = stats.total ? (stats.telegram / stats.total) * 100 : 0;
              const ofPct  = stats.total ? (stats.of / stats.total) * 100 : 0;
              return (
                <div key={src} className="bg-surface-container-high p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-sm" style={{ color }}>{label}</span>
                    <span className="text-2xl font-black" style={{ color }}>{stats.total}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Telegram activo</span>
                      <span>{stats.telegram} <span className="opacity-60">({telPct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-surface-container-lowest rounded-full">
                      <div className="h-full rounded-full bg-[#00e3fd]" style={{ width: `${telPct}%` }} />
                    </div>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>OF activo</span>
                      <span>{stats.of} <span className="opacity-60">({ofPct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-surface-container-lowest rounded-full">
                      <div className="h-full rounded-full bg-[#ff6c95]" style={{ width: `${ofPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Top Countries */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Top Países</h2>
          <div className="bg-surface-container-high p-5 space-y-3">
            {topCountries.map(([country, count]) => {
              const pctVal = total ? (count / total) * 100 : 0;
              return (
                <div key={country} className="flex items-center gap-3">
                  <span className="text-sm w-24 truncate text-on-surface">{country}</span>
                  <div className="flex-1 h-2 bg-surface-container-lowest rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pctVal}%` }} />
                  </div>
                  <span className="text-xs text-on-surface-variant w-12 text-right">{count} <span className="opacity-60">({pctVal.toFixed(0)}%)</span></span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top Languages + Devices */}
        <section className="space-y-6">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Idiomas</h2>
            <div className="bg-surface-container-high p-5 space-y-3">
              {topLangs.map(([lang, count]) => {
                const pctVal = total ? (count / total) * 100 : 0;
                return (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="text-sm w-16 truncate text-on-surface uppercase">{lang}</span>
                    <div className="flex-1 h-2 bg-surface-container-lowest rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-secondary" style={{ width: `${pctVal}%` }} />
                    </div>
                    <span className="text-xs text-on-surface-variant w-10 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Dispositivos</h2>
            <div className="bg-surface-container-high p-5 space-y-3">
              {Object.entries(devices).sort((a, b) => b[1] - a[1]).map(([device, count]) => {
                const pctVal = total ? (count / total) * 100 : 0;
                return (
                  <div key={device} className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-sm text-on-surface-variant">
                      {device.includes('mobile') || device.includes('phone') ? 'smartphone' : device.includes('tablet') ? 'tablet' : 'computer'}
                    </span>
                    <span className="text-sm flex-1 text-on-surface capitalize">{device}</span>
                    <div className="w-24 h-2 bg-surface-container-lowest rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-tertiary" style={{ width: `${pctVal}%` }} />
                    </div>
                    <span className="text-xs text-on-surface-variant w-10 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* CupidBot stats */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Estado CupidBot</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Activo',  value: cupidCount,                                              color: '#22c55e', icon: 'smart_toy'    },
            { label: 'Pausado', value: all.filter(l => l.cupidbot_pausado).length,              color: '#f97316', icon: 'pause_circle' },
            { label: 'Inactivo', value: all.filter(l => !l.cupidbot_activo && !l.cupidbot_pausado).length, color: '#9ca3af', icon: 'cancel' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface-container-high p-5 flex items-center gap-4">
              <span className="material-symbols-outlined text-2xl" style={{ color: stat.color }}>{stat.icon}</span>
              <div>
                <div className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs text-on-surface-variant">{stat.label} · {pct(stat.value, total)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
