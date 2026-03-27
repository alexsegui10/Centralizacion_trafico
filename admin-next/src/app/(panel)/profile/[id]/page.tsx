import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import ProfileClient from '@/components/ProfileClient';
import type { Lead, LeadEvent, LeadMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export default async function ProfilePage({ params }: Params) {
  const { id } = await params;
  const supabase = createServerClient();

  const [leadRes, eventsRes, messagesRes] = await Promise.all([
    supabase.from('leads').select('*').eq('visitor_id', id).single(),
    supabase.from('eventos').select('*').eq('visitor_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('mensajes').select('*').eq('visitor_id', id).order('created_at', { ascending: true }),
  ]);

  if (!leadRes.data) notFound();

  return (
    <ProfileClient
      lead={leadRes.data as Lead}
      events={(eventsRes.data ?? []) as LeadEvent[]}
      messages={(messagesRes.data ?? []) as LeadMessage[]}
    />
  );
}
