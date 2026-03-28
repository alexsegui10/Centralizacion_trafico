import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  // Auth check — same as middleware
  const cookie = req.cookies.get('ofm_admin_session')?.value;
  if (!cookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
    await jwtVerify(cookie, secret);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { visitor_id, contenido, tipo, bot_tipo } = await req.json();

  if (!visitor_id || !contenido) {
    return NextResponse.json({ error: 'visitor_id and contenido required' }, { status: 400 });
  }

  const { error } = await supabase.from('mensajes').insert({
    visitor_id,
    tipo: tipo ?? 'bot',
    bot_tipo: bot_tipo ?? null,
    contenido,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
