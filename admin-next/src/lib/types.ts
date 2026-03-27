export interface Lead {
  visitor_id: string;
  fingerprint_hash?: string | null;
  modelo_id?: string | null;
  utm_source?: string | null;
  idioma?: string | null;
  dispositivo?: string | null;
  user_agent?: string | null;
  ip_hash?: string | null;
  pais?: string | null;
  ciudad?: string | null;
  of_activo?: boolean;
  telegram_activo?: boolean;
  mgo_directo?: boolean;
  mgo_en_canal?: boolean;
  invite_link?: string | null;
  invite_link_created_at?: string | null;
  telegram_user_id?: string | null;
  last_bot_action?: string | null;
  active_flow?: string | null;
  winback_sent?: boolean;
  cupidbot_activo?: boolean;
  cupidbot_pausado?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LeadEvent {
  request_id: string;
  visitor_id: string;
  modelo_id?: string | null;
  boton_clickado?: string | null;
  utm_source?: string | null;
  idioma?: string | null;
  dispositivo?: string | null;
  user_agent?: string | null;
  fingerprint_hash?: string | null;
  created_at: string;
}

export interface LeadMessage {
  id: string;
  visitor_id: string;
  tipo: 'bot' | 'usuario';
  bot_tipo?: 'cupidbot' | 'bot_ventas' | null;
  contenido: string;
  created_at: string;
}

export type FlowId = '1' | '2' | '3' | '4' | '5' | '6';

export interface FlowConfig {
  id: FlowId;
  name: string;
  description: string;
  color: string;
  borderColor: string;
  icon: string;
}

export interface DashboardMetrics {
  totalLeads: number;
  telegramActive: number;
  ofActive: number;
  cupidActive: number;
  flowCounts: Record<FlowId, number>;
  sourceStats: Record<string, { total: number; telegram: number; of: number }>;
}
