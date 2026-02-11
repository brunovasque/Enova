import { NextResponse } from 'next/server';
import { sb } from '../../../lib/server';

type AnyRow = Record<string, any>;

async function loadFlagsFallback() {
  try {
    return await sb('/enova_conversation_flags?select=wa_id,bot_paused,priority,human_notes,updated_at');
  } catch {
    return [];
  }
}

export async function GET() {
  const messages = await sb('/enova_messages?select=wa_id,text,ts&order=ts.desc');
  const state = await sb('/enova_state?select=wa_id,bot_paused,priority,human_notes,fase_conversa,updated_at').catch(() => []);
  const fallbackFlags = await loadFlagsFallback();

  const stateMap = new Map<string, AnyRow>();
  for (const st of state || []) stateMap.set(st.wa_id, st);

  const flagsMap = new Map<string, AnyRow>();
  for (const ff of fallbackFlags || []) flagsMap.set(ff.wa_id, ff);

  const byWa = new Map<string, { wa_id: string; last_text: string | null; last_ts: string }>();
  for (const row of messages || []) {
    if (!byWa.has(row.wa_id)) {
      byWa.set(row.wa_id, { wa_id: row.wa_id, last_text: row.text, last_ts: row.ts });
    }
  }

  for (const st of state || []) {
    if (!byWa.has(st.wa_id)) {
      byWa.set(st.wa_id, { wa_id: st.wa_id, last_text: null, last_ts: st.updated_at || new Date().toISOString() });
    }
  }

  for (const ff of fallbackFlags || []) {
    if (!byWa.has(ff.wa_id)) {
      byWa.set(ff.wa_id, { wa_id: ff.wa_id, last_text: null, last_ts: ff.updated_at || new Date().toISOString() });
    }
  }

  const merged = [...byWa.values()].map((base) => {
    const st = stateMap.get(base.wa_id);
    const ff = flagsMap.get(base.wa_id);

    return {
      ...base,
      bot_paused: Boolean(st?.bot_paused ?? ff?.bot_paused),
      priority: st?.priority || ff?.priority || null,
      human_notes: st?.human_notes || ff?.human_notes || null,
      stage: st?.fase_conversa || null
    };
  }).sort((a, b) => (a.last_ts < b.last_ts ? 1 : -1));

  return NextResponse.json({ ok: true, conversations: merged });
}
