import { NextRequest, NextResponse } from 'next/server';
import { sb } from '../../../lib/server';

export async function GET(req: NextRequest) {
  const wa_id = req.nextUrl.searchParams.get('wa_id');
  if (!wa_id) return NextResponse.json({ ok: false, error: 'wa_id required' }, { status: 400 });

  const rows = await sb(`/enova_messages?select=id,wa_id,direction,text,ts,stage,source&wa_id=eq.${encodeURIComponent(wa_id)}&order=ts.asc`);
  return NextResponse.json({ ok: true, messages: rows || [] });
}
