'use client';

// Concierge Chat IA — floating bubble UI mounted on the client dashboard.
// Bottom-right button → opens a bottom-sheet panel (mobile) / right-anchored
// drawer (desktop) with a streaming message thread.
//
// Behaviors :
//   - Auto-detects feature availability via /api/feature-flags/me (the hook
//     `useFeatureFlag('concierge-chat')`). Renders nothing if disabled.
//   - Streams responses via SSE — text appears progressively.
//   - Keeps last 20 turns in state ; older trimmed on send.
//   - i18n FR/EN derived from props.
//   - Persists conversation in sessionStorage so a page reload doesn't lose
//     it ; cleared when the panel is explicitly cleared by the user.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, Trash2 } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

interface Props {
  locale: 'fr' | 'en';
  clientFirstName: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
}

const STORAGE_KEY = 'concierge-chat-thread-v1';
const MAX_THREAD = 20;

const L = {
  fr: {
    cta: 'Concierge IA',
    title: 'Concierge Dog Universe',
    subtitle: 'Posez-moi vos questions sur la pension, votre compagnon, nos services.',
    placeholder: 'Écrivez votre message…',
    send: 'Envoyer',
    sending: 'Envoi…',
    clear: 'Effacer la conversation',
    close: 'Fermer',
    error: 'Désolé, une erreur technique est survenue. Réessayez dans un instant.',
    rateLimited: 'Vous avez atteint la limite de messages pour cette heure. Réessayez plus tard.',
    disabled: 'Le concierge n\'est pas disponible pour le moment.',
    greeting: (name: string | null) => name
      ? `Bonjour ${name} 🐾 Comment puis-je vous aider aujourd'hui ?`
      : 'Bonjour 🐾 Comment puis-je vous aider aujourd\'hui ?',
    suggestions: [
      'Quels sont vos tarifs pour la pension ?',
      'Comment fonctionne le Pet Taxi ?',
      'Mon chien est anxieux, comment se passe l\'accueil ?',
    ],
    poweredBy: 'Propulsé par Claude IA — Anthropic',
  },
  en: {
    cta: 'AI Concierge',
    title: 'Dog Universe Concierge',
    subtitle: 'Ask me anything about boarding, your pet, or our services.',
    placeholder: 'Type your message…',
    send: 'Send',
    sending: 'Sending…',
    clear: 'Clear conversation',
    close: 'Close',
    error: 'Sorry, a technical issue occurred. Please try again shortly.',
    rateLimited: 'You\'ve hit the message limit for this hour. Try again later.',
    disabled: 'The concierge is unavailable right now.',
    greeting: (name: string | null) => name
      ? `Hello ${name} 🐾 How can I help you today?`
      : 'Hello 🐾 How can I help you today?',
    suggestions: [
      'What are your boarding rates?',
      'How does the Pet Taxi work?',
      'My dog is anxious — what\'s the welcome like?',
    ],
    poweredBy: 'Powered by Claude AI — Anthropic',
  },
} as const;

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ConciergeChat({ locale, clientFirstName }: Props) {
  const l = L[locale];
  const { enabled } = useFeatureFlag('concierge-chat');
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore thread from sessionStorage on mount (per-tab persistence).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setThread(parsed.slice(-MAX_THREAD));
      }
    } catch { /* ignore */ }
  }, []);

  // Persist on every change.
  useEffect(() => {
    try {
      if (thread.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(thread.slice(-MAX_THREAD)));
      }
    } catch { /* ignore quota / private mode */ }
  }, [thread]);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread, open]);

  // Cancel in-flight stream on unmount / close.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = { id: genId(), role: 'user', content: trimmed };
    const assistantMsg: ChatMessage = { id: genId(), role: 'assistant', content: '', streaming: true };
    setThread((prev) => [...prev.slice(-(MAX_THREAD - 2)), userMsg, assistantMsg]);
    setInput('');
    setError(null);
    setSending(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Build the API payload — drop streaming flag, keep role+content only.
      const payloadMessages = [...thread, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const r = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages }),
        signal: ctrl.signal,
      });

      if (!r.ok) {
        const status = r.status;
        const msg = status === 429 ? l.rateLimited : status === 403 ? l.disabled : l.error;
        setError(msg);
        setThread((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: msg, streaming: false, error: true } : m,
          ),
        );
        return;
      }

      // Read SSE stream
      const reader = r.body?.getReader();
      if (!reader) throw new Error('No stream body');
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data) as { chunk?: string; error?: string; done?: boolean };
            if (evt.error) {
              setError(l.error);
              setThread((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: l.error, streaming: false, error: true } : m,
                ),
              );
              return;
            }
            if (evt.chunk) {
              acc += evt.chunk;
              setThread((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc } : m)),
              );
            }
          } catch {
            /* malformed SSE — skip */
          }
        }
      }

      // Mark assistant message as done.
      setThread((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m)),
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User closed panel mid-stream — drop the partial assistant message.
        setThread((prev) => prev.filter((m) => m.id !== assistantMsg.id));
      } else {
        setError(l.error);
        setThread((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: l.error, streaming: false, error: true } : m,
          ),
        );
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [thread, sending, l]);

  function onSuggestion(s: string) {
    void sendMessage(s);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function clearThread() {
    abortRef.current?.abort();
    setThread([]);
    setError(null);
  }

  function closePanel() {
    abortRef.current?.abort();
    setOpen(false);
  }

  if (!enabled) return null;

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={l.cta}
          className="fixed bottom-6 right-6 z-[900] inline-flex items-center gap-2 px-4 py-3 rounded-full bg-[#141428] hover:bg-[#1F1F3D] text-[#D4AF37] shadow-[0_10px_30px_rgba(20,20,40,0.35)] border border-[#D4AF37]/40 transition-all hover:scale-105"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium hidden sm:inline">{l.cta}</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="concierge-title"
          className="fixed inset-0 z-[950] flex items-end sm:items-stretch sm:justify-end bg-black/40 sm:bg-transparent sm:pointer-events-none"
          onClick={(e) => { if (e.target === e.currentTarget) closePanel(); }}
        >
          <div
            className="bg-white w-full sm:w-[420px] sm:h-full max-h-[88vh] sm:max-h-full rounded-t-3xl sm:rounded-none shadow-[0_-10px_40px_rgba(0,0,0,0.25)] sm:shadow-[-10px_0_30px_rgba(0,0,0,0.15)] flex flex-col pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gradient-to-r from-[#141428] to-[#1F1F3D] rounded-t-3xl sm:rounded-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-[#D4AF37]" />
                </div>
                <div className="min-w-0">
                  <h3 id="concierge-title" className="text-sm font-serif font-bold text-[#F5EDD8] truncate">
                    {l.title}
                  </h3>
                  <p className="text-[10px] text-[#D4AF37]/80 truncate">{l.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {thread.length > 0 && (
                  <button
                    type="button"
                    onClick={clearThread}
                    aria-label={l.clear}
                    title={l.clear}
                    className="p-2 rounded-full hover:bg-white/10 text-[#D4AF37]/80 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePanel}
                  aria-label={l.close}
                  className="p-2 rounded-full hover:bg-white/10 text-[#D4AF37]/80 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Message thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#FAF6F0]">
              {thread.length === 0 ? (
                <div className="flex flex-col gap-3 mt-2">
                  <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 border border-[#C4974A]/20 max-w-[85%]">
                    <p className="text-sm text-[#2A2520] leading-relaxed">{l.greeting(clientFirstName)}</p>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    {l.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onSuggestion(s)}
                        className="text-left text-xs px-3 py-2 rounded-full border border-[#C4974A]/30 text-[#C4974A] bg-white hover:bg-[#C4974A]/10 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                thread.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        m.role === 'user'
                          ? 'bg-[#141428] text-[#F5EDD8] rounded-2xl rounded-tr-md'
                          : m.error
                          ? 'bg-red-50 text-red-700 border border-red-100 rounded-2xl rounded-tl-md'
                          : 'bg-white text-[#2A2520] border border-[#C4974A]/20 rounded-2xl rounded-tl-md'
                      }`}
                    >
                      {m.content}
                      {m.streaming && m.content.length === 0 && (
                        <Loader2 className="inline h-3.5 w-3.5 animate-spin text-[#8A7E75]" />
                      )}
                      {m.streaming && m.content.length > 0 && (
                        <span className="inline-block w-1.5 h-3.5 bg-[#C4974A] ml-0.5 animate-pulse align-middle" aria-hidden />
                      )}
                    </div>
                  </div>
                ))
              )}
              {error && thread.length === 0 && (
                <p className="text-xs text-red-600 text-center">{error}</p>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={onSubmit}
              className="px-4 py-3 border-t border-gray-100 bg-white flex flex-col gap-2"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  placeholder={l.placeholder}
                  rows={1}
                  disabled={sending}
                  className="flex-1 px-3 py-2 text-base bg-[#FAF6F0] border border-[#C4974A]/20 rounded-2xl text-[#2A2520] resize-none max-h-32 focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || input.trim().length === 0}
                  aria-label={l.send}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#C4974A] hover:bg-[#A8823F] disabled:opacity-50 text-white transition-colors shrink-0"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[9px] text-[#8A7E75] text-center leading-tight">{l.poweredBy}</p>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
