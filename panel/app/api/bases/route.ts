import { NextResponse } from "next/server";

import { BasesRequest, LeadPool, LeadTemp, REQUIRED_ENVS, isLeadPool, isLeadTemp, listLeadsForPanel, runBasesAction } from "./_shared";

export async function GET(request: Request) {
  const missingEnvs = REQUIRED_ENVS.filter((k) => !process.env[k]);
  if (missingEnvs.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missingEnvs.join(", ")}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { searchParams } = new URL(request.url);
  const leadPoolRaw = searchParams.get("lead_pool");
  const leadTempRaw = searchParams.get("lead_temp");
  const leadPool: LeadPool | undefined = isLeadPool(leadPoolRaw) ? leadPoolRaw : undefined;
  const leadTemp: LeadTemp | undefined = isLeadTemp(leadTempRaw) ? leadTempRaw : undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;

  try {
    const leads = await listLeadsForPanel(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      { lead_pool: leadPool, lead_temp: leadTemp, limit },
    );
    return NextResponse.json(
      { ok: true, leads, total: leads.length },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "internal error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

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
