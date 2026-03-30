import { NextResponse } from "next/server";

import { BasesRequest, runBasesAction } from "./_shared";

export async function POST(request: Request) {
  let payload: BasesRequest;

  try {
    payload = (await request.json()) as BasesRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await runBasesAction(payload);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
