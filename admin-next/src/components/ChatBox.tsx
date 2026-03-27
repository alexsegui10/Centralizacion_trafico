'use client';
import { useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { fmtDate } from '@/lib/flows';
import type { LeadMessage } from '@/lib/types';

interface ChatBoxProps {
  visitorId: string;
  initialMessages: LeadMessage[];
}

export default function ChatBox({ visitorId, initialMessages }: ChatBoxProps) {
  const [messages, setMessages] = useState<LeadMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`chat-${visitorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `visitor_id=eq.${visitorId}` },
        payload => setMessages(prev => [...prev, payload.new as LeadMessage])
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [visitorId]);

  async function send() {
    if (!input.trim()) return;
    setSending(true);
    try {
      await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId, contenido: input.trim(), tipo: 'bot', bot_tipo: 'cupidbot' }),
      });
      setInput('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-surface-container-high flex flex-col h-80">
      {/* Header */}
      <div className="px-4 py-3 border-b border-outline-variant/10 flex items-center gap-2">
        <span className="material-symbols-outlined text-secondary text-sm">chat</span>
        <span className="text-xs font-bold text-on-surface uppercase tracking-widest">Chat / Historial</span>
        <span className="ml-auto text-[10px] text-on-surface-variant">{messages.length} mensajes</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-on-surface-variant/40 text-xs py-8">Sin mensajes aún</p>
        ) : (
          messages.map(msg => {
            const isBot = msg.tipo === 'bot';
            return (
              <div key={msg.id} className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded text-xs space-y-0.5 ${
                  isBot
                    ? 'bg-surface-container text-on-surface'
                    : 'bg-primary/20 text-primary'
                }`}>
                  {msg.bot_tipo && (
                    <p className="text-[9px] uppercase tracking-widest opacity-60">{msg.bot_tipo}</p>
                  )}
                  <p className="leading-relaxed">{msg.contenido}</p>
                  <p className="text-[9px] opacity-40">{fmtDate(msg.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-outline-variant/10 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Forzar mensaje como bot..."
          className="flex-1 bg-surface-container border border-outline-variant/20 text-on-surface text-xs px-3 py-2 focus:outline-none focus:border-primary/60 placeholder:text-on-surface-variant/30"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="bg-primary text-on-primary-fixed text-xs font-bold px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-30"
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
