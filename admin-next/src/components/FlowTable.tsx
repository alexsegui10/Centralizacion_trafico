import { FLOWS } from '@/lib/flows';
import type { FlowId } from '@/lib/types';

interface FlowTableProps {
  flowCounts: Record<FlowId, number>;
  totalLeads: number;
}

export default function FlowTable({ flowCounts, totalLeads }: FlowTableProps) {
  const rows = (['1', '2', '3', '4', '5', '6'] as FlowId[]).map(id => ({
    flow: FLOWS[id],
    count: flowCounts[id] ?? 0,
    pct: totalLeads > 0 ? Math.round(((flowCounts[id] ?? 0) / totalLeads) * 100) : 0,
  }));

  return (
    <section className="bg-surface-container-high overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-outline-variant/5 flex justify-between items-center">
        <h2 className="text-base font-bold text-on-surface uppercase tracking-tight">Flujos activos</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">Tiempo real</span>
          <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-lowest text-on-surface-variant uppercase text-[10px] font-bold tracking-widest">
              <th className="px-6 py-4">Flujo</th>
              <th className="px-6 py-4">Usuarios</th>
              <th className="px-6 py-4">% del total</th>
              <th className="px-6 py-4">Distribución</th>
              <th className="px-6 py-4">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {rows.map(({ flow, count, pct }) => {
              const isConflict = flow.id === '6';
              const isVip = flow.id === '4';
              return (
                <tr key={flow.id} className="hover:bg-surface-bright/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center font-bold text-xs text-surface"
                        style={{ backgroundColor: flow.color }}
                      >
                        F{flow.id}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{flow.name}</p>
                        <p className="text-[10px] text-on-surface-variant">{flow.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium tabular-nums">{count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant tabular-nums">{pct}%</td>
                  <td className="px-6 py-4">
                    <div className="w-28 bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: flow.color }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {isConflict && count > 0 ? (
                      <span className="px-2 py-1 rounded bg-error/10 text-error text-[10px] font-bold uppercase tracking-widest border border-error/20">
                        Alerta
                      </span>
                    ) : isVip ? (
                      <span className="px-2 py-1 rounded bg-tertiary/10 text-tertiary text-[10px] font-bold uppercase tracking-widest border border-tertiary/20">
                        VIP
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-widest border border-green-500/20">
                        Activo
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
