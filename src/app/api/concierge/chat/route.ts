// POST /api/concierge/chat
//
// Streaming chat endpoint backed by Claude Haiku 4.5 — Concierge IA for
// luxury pet-boarding clients. Returns Server-Sent Events :
//   - `data: {"chunk":"..."}\n\n`   text deltas
//   - `data: [DONE]\n\n`             stream finished
//   - `data: {"error":"..."}\n\n`   fatal error before stream
//
// Cost control :
//   - Claude Haiku 4.5 : $1 / 1M input, $5 / 1M output
//   - System prompt cached (~4.5K tokens) → reads at ~0.1× input price
//   - `max_tokens: 400` per response → ceiling at $0.002/exchange
//   - Last 10 user/assistant turns sent ; older context dropped client-side
//   - Rate-limited 15 msg/h/user (middleware)
//   - Feature-flagged off by default (concierge-chat) — kill-switch
//   - Fail-closed if ANTHROPIC_API_KEY missing (no silent passthrough)

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { auth } from '../../../../../auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { CONCIERGE_SYSTEM_PROMPT } from '@/lib/concierge/prompt';
import { logger } from '@/lib/logger';

const CONCIERGE_MODEL = 'claude-haiku-4-5';
const MAX_OUTPUT_TOKENS = 400;
const MAX_HISTORY_TURNS = 10;
const MAX_USER_MESSAGE_LEN = 2000;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(MAX_USER_MESSAGE_LEN),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
});

// Lazy singleton — same pattern as vaccinations extract route.
let _client: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  return _client;
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  // Concierge is for CLIENT only — admins have their own tooling.
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'CLIENT_ONLY' }, { status: 403 });
  }

  // Feature flag — kill-switch + progressive rollout per user.
  const enabled = await isFeatureEnabled('concierge-chat', {
    userId: session.user.id,
    role: session.user.role,
  });
  if (!enabled) {
    return NextResponse.json({ error: 'FEATURE_DISABLED' }, { status: 403 });
  }

  // Fail-closed if no API key — no silent passthrough to a generic LLM.
  const client = getAnthropic();
  if (!client) {
    logger.warn('concierge', 'ANTHROPIC_API_KEY missing — feature unavailable');
    return NextResponse.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_BODY', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // The first message MUST be user-role (Anthropic API rule). Also enforce
  // the last message is user-role (you can't stream a reply to an assistant
  // message). Trim to last MAX_HISTORY_TURNS pairs to keep input small.
  let messages = parsed.messages;
  if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'INVALID_MESSAGE_ORDER' }, { status: 400 });
  }
  if (messages.length > MAX_HISTORY_TURNS * 2) {
    // Keep the FIRST user message (initial context) + the most recent turns.
    const recent = messages.slice(-(MAX_HISTORY_TURNS * 2 - 1));
    messages = [messages[0], ...recent];
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        const claudeStream = client.messages.stream({
          model: CONCIERGE_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          // System prompt is sent as an array with `cache_control` so the
          // ~4.5K-token prefix is cached after the first request (5min TTL
          // default ; auto-refreshes on every read). Reads are ~10x cheaper
          // than fresh input.
          system: [
            {
              type: 'text',
              text: CONCIERGE_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages,
        });

        // Forward text deltas as SSE chunks. The SDK exposes `text` event
        // for delta strings (vs raw `content_block_delta` events).
        claudeStream.on('text', (delta: string) => {
          send(sse({ chunk: delta }));
        });

        // Wait for completion — finalMessage() resolves with the full Message
        // object once the stream ends (or rejects on error / abort).
        const finalMessage = await claudeStream.finalMessage();
        send(sse({ done: true, usage: finalMessage.usage }));
        send('data: [DONE]\n\n');
        close();
      } catch (err) {
        // Stream-level error — surface to client as a `error` event then close.
        // (We're inside the stream body, so we can't change the HTTP status.)
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('concierge', 'stream_failed', {
          userId: session.user.id,
          error: msg,
        });
        send(sse({ error: 'STREAM_FAILED' }));
        send('data: [DONE]\n\n');
        close();
      }

      // Detect client disconnect — cleanup is implicit via ReadableStream cancel.
      request.signal.addEventListener('abort', close);
    },
    cancel() {
      // Consumer aborted — nothing extra to clean up (Anthropic stream is
      // GC'd when its references drop).
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
