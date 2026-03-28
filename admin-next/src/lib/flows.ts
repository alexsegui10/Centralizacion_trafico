import type { Lead, FlowId, FlowConfig } from './types';

export const FLOWS: Record<FlowId, FlowConfig> = {
  '1': { id: '1', name: 'MGO Directo',    description: 'mgo_directo=true → bot ventas',           color: '#22c55e', borderColor: 'border-green-500',  icon: 'trending_up' },
  '2': { id: '2', name: 'MGO Canal',      description: 'mgo_en_canal=true → ¿buscas algo?',       color: '#3b82f6', borderColor: 'border-blue-500',   icon: 'group' },
  '3': { id: '3', name: 'Tráfico Frío',   description: 'telegram_activo, sin MGO → CupidBot',     color: '#b6a0ff', borderColor: 'border-primary',    icon: 'send' },
  '4': { id: '4', name: 'VIP OnlyFans',   description: 'of_activo=true → atención manual',        color: '#ff6c95', borderColor: 'border-tertiary',   icon: 'star' },
  '5': { id: '5', name: 'Winback MGO',    description: 'MGO + 14 días inactivo → CupidBot',       color: '#f97316', borderColor: 'border-orange-500', icon: 'replay' },
  '6': { id: '6', name: 'Conflicto',      description: '2+ señales → alerta + gestión manual',    color: '#ff6e84', borderColor: 'border-error',      icon: 'warning' },
};

export function inferFlow(lead: Lead): FlowId {
  if (String(lead.active_flow ?? '') === '6') return '6';
  if (lead.of_activo) return '4';
  if (lead.mgo_directo) return '1';
  if (lead.mgo_en_canal && !lead.mgo_directo) return '2';
  if (lead.telegram_activo && !lead.mgo_directo && !lead.mgo_en_canal && !lead.of_activo) return '3';

  const updated = new Date(lead.updated_at ?? lead.created_at ?? Date.now()).getTime();
  const days = (Date.now() - updated) / (1000 * 60 * 60 * 24);
  if (!lead.winback_sent && (lead.mgo_directo || lead.mgo_en_canal) && days > 14) return '5';
  // Only show as F3 if they've actually joined Telegram — not unqualified cold leads
  if (lead.telegram_activo) return '3';
  // Unclassified lead with active_flow set — use that
  if (lead.active_flow) return lead.active_flow as FlowId;
  // Truly unclassified — return '3' as holding column but only if telegram is set
  return '3';
}

export function sourceOf(lead: Lead): string {
  if (lead.mgo_directo || lead.mgo_en_canal) return 'mgo';
  const raw = String(lead.utm_source ?? 'direct').toLowerCase();
  if (raw.includes('insta')) return 'instagram';
  if (raw.includes('tiktok')) return 'tiktok';
  if (raw === 'x' || raw.includes('twitter')) return 'x';
  if (raw.includes('reddit')) return 'reddit';
  if (raw.includes('mgo')) return 'mgo';
  return raw || 'direct';
}

export const SOURCE_COLORS: Record<string, string> = {
  instagram: '#b6a0ff',
  tiktok:    '#ff6c95',
  x:         '#4cc9f0',
  twitter:   '#4cc9f0',
  reddit:    '#f97316',
  mgo:       '#22c55e',
  direct:    '#9ca3af',
};

export const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok:    'TikTok',
  x:         'X / Twitter',
  reddit:    'Reddit',
  mgo:       'MGO',
  direct:    'Direct',
};

export function fmtDate(v?: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtSince(v?: string | null): string {
  if (!v) return '-';
  const t = new Date(v).getTime();
  if (isNaN(t)) return '-';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  return `${Math.floor(hr / 24)}d`;
}

export function countryFlag(country?: string | null): string {
  if (!country) return '';
  const aliases: Record<string, string> = {
    'united states': 'US', usa: 'US', us: 'US',
    'united kingdom': 'GB', uk: 'GB', gb: 'GB',
    spain: 'ES', espana: 'ES', españa: 'ES', es: 'ES',
    mexico: 'MX', méxico: 'MX', mx: 'MX',
    argentina: 'AR', ar: 'AR',
    colombia: 'CO', co: 'CO',
    brazil: 'BR', brasil: 'BR', br: 'BR',
    france: 'FR', fr: 'FR',
    germany: 'DE', de: 'DE',
    italy: 'IT', it: 'IT',
    portugal: 'PT', pt: 'PT',
    chile: 'CL', cl: 'CL',
    peru: 'PE', perú: 'PE', pe: 'PE',
    venezuela: 'VE', ve: 'VE',
  };
  const key = country.toLowerCase().trim();
  const code = aliases[key] ?? (key.length === 2 ? key.toUpperCase() : null);
  if (!code || code.length !== 2) return '';
  try {
    return String.fromCodePoint(...[...code].map(c => c.charCodeAt(0) + 127397));
  } catch { return ''; }
}

export function groupByFlow(leads: Lead[]): Record<FlowId, Lead[]> {
  const groups: Record<FlowId, Lead[]> = { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] };
  for (const lead of leads) groups[inferFlow(lead)].push(lead);
  return groups;
}

export function groupBySource(leads: Lead[]): Record<string, { total: number; telegram: number; of: number }> {
  const result: Record<string, { total: number; telegram: number; of: number }> = {};
  for (const lead of leads) {
    const src = sourceOf(lead);
    if (!result[src]) result[src] = { total: 0, telegram: 0, of: 0 };
    result[src].total++;
    if (lead.telegram_activo) result[src].telegram++;
    if (lead.of_activo) result[src].of++;
  }
  return result;
}

export function shortId(visitorId: string): string {
  return visitorId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function initials(visitorId: string): string {
  return visitorId.slice(0, 2).toUpperCase();
}
