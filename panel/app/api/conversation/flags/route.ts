import { NextRequest, NextResponse } from 'next/server';
import { sb } from '../../../../lib/server';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wa_id = body?.wa_id as string;
  const human_notes = (body?.human_notes ?? null) as string | null;
  const priority = (body?.priority ?? null) as string | null;

  if (!wa_id) {
    return NextResponse.json({ ok: false, error: 'wa_id required' }, { status: 400 });
  }

  const patch = {
    human_notes,
    priority,
    updated_at: new Date().toISOString()
  };

  try {
    await sb(`/enova_state?wa_id=eq.${encodeURIComponent(wa_id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      headers: { Prefer: 'return=minimal' }
    });
    return NextResponse.json({ ok: true, wa_id, source: 'enova_state' });
  } catch {
    await sb('/enova_conversation_flags', {
      method: 'POST',
      body: JSON.stringify([{ wa_id, ...patch }]),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }
    });
    return NextResponse.json({ ok: true, wa_id, source: 'enova_conversation_flags' });
  }
}
