import { NextResponse } from 'next/server';
import { sb } from '../../../lib/server';

export async function GET() {
  const worker = process.env.WORKER_BASE_URL!;

  const buildResp = await fetch(`${worker}/__build`, { cache: 'no-store' });
  const buildJson = await buildResp.json().catch(() => ({ ok: false }));

  let dbOk = false;
  try {
    await sb('/enova_state?select=wa_id&limit=1');
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    ok: true,
    worker: buildJson,
    db: { ok: dbOk }
  });
}
