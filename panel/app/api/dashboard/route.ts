import { NextResponse } from 'next/server';
import { sb } from '../../../lib/server';

export async function GET() {
  const state = await sb('/enova_state?select=wa_id,fase_conversa,updated_at,bot_paused').catch(() => []);
  const fallbackFlags = await sb('/enova_conversation_flags?select=wa_id,bot_paused').catch(() => []);
  const flagMap = new Map<string, boolean>();
  for (const f of fallbackFlags || []) flagMap.set(f.wa_id, Boolean(f.bot_paused));

  const now = Date.now();
  const byStage: Record<string, number> = {};
  let slaDelayed = 0;

  for (const row of state || []) {
    const stage = row.fase_conversa || 'inicio';
    byStage[stage] = (byStage[stage] || 0) + 1;
    const paused = Boolean(row.bot_paused ?? flagMap.get(row.wa_id));
    const minutes = (now - new Date(row.updated_at || now).getTime()) / 60000;
    if (minutes > 30 && !paused) slaDelayed += 1;
  }

  return NextResponse.json({ ok: true, byStage, slaDelayed });
}
