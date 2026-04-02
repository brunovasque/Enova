import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getClientProfile, writeClientProfile, ClientProfileUpdatePayload } from "./_shared";

const AUTH_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE", "ENOVA_ADMIN_KEY"] as const;

function hasValidAdminKey(received: string, expected: string): boolean {
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  if (receivedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(receivedBuf, expectedBuf);
}

function authGuard(request: Request): NextResponse | null {
  const missing = (AUTH_ENVS as readonly string[]).filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missing.join(", ")}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const adminKey = process.env.ENOVA_ADMIN_KEY as string;
  const receivedKey = request.headers.get("x-enova-admin-key") ?? "";

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
  const wa_id = searchParams.get("wa_id");

  if (!wa_id?.trim()) {
    return NextResponse.json(
      { ok: false, error: "wa_id obrigatório" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const profile = await getClientProfile(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      wa_id.trim(),
    );
    return NextResponse.json(
      { ok: true, profile },
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

  let payload: ClientProfileUpdatePayload;
  try {
    payload = (await request.json()) as ClientProfileUpdatePayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!payload.wa_id?.trim()) {
    return NextResponse.json(
      { ok: false, error: "wa_id obrigatório" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const saved = await writeClientProfile(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string,
      payload,
    );
    return NextResponse.json(
      { ok: true, profile: saved },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "internal error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
