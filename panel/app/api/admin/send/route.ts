import { NextRequest, NextResponse } from 'next/server';
import { callAdmin } from '../../../../lib/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = await callAdmin('/__admin__/send', body);
  return NextResponse.json(data);
}
