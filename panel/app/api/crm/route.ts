import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { CrmRequest, REQUIRED_ENVS, listCrmLeads, runCrmAction } from "./_shared";

const AUTH_ENVS = [...REQUIRED_ENVS, "ENOVA_ADMIN_KEY"] as const;

function hasValidAdminKey(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function authGuard(request: Request): NextResponse | null {
  const missingEnvs = AUTH_ENVS.filter((k) => !process.env[k]);
  if (missingEnvs.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missingEnvs.join(", ")}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const adminKey = process.env.ENOVA_ADMIN_KEY as string;
  const receivedKey = request.headers.get("x-enova-admin-key") || "";

  if (!receivedKey) {
    return NextResponse.json(
      { ok: false, error: "missing x-enova-admin-key" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!hasValidAdminKey(receivedKey, adminKey)) {
    return NextResponse.json(
      { ok: false, error: "invalid x-enova-admin-key" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return null;
}

export async function GET(request: Request) {
  const denied = authGuard(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") ?? undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;

  try {
    const leads = await listCrmLeads(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      { tab, limit },
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
  const denied = authGuard(request);
  if (denied) return denied;

  let payload: CrmRequest;

  try {
    payload = (await request.json()) as CrmRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await runCrmAction(payload);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
