import { NextResponse } from "next/server";
import { resolveCaseFileById, type EnovaDocRow } from "../_shared";

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

function isAllowedFileOrigin(rawUrl: string, supabaseUrl: string): boolean {
  let target: URL;
  let supabase: URL;
  try {
    target = new URL(rawUrl);
    supabase = new URL(supabaseUrl);
  } catch {
    return false;
  }

  if (target.protocol !== "https:") {
    return false;
  }

  const host = String(target.hostname || "").toLowerCase();
  if (!host) {
    return false;
  }

  const supabaseHost = String(supabase.hostname || "").toLowerCase();
  const isSupabase =
    host === supabaseHost ||
    host.endsWith(".supabase.co") ||
    host.endsWith(".supabase.in");
  if (isSupabase) {
    return true;
  }

  const isMetaProtected =
    host === "lookaside.fbsbx.com" ||
    host.endsWith(".lookaside.fbsbx.com") ||
    host === "graph.facebook.com" ||
    host.endsWith(".graph.facebook.com") ||
    host.endsWith(".fbsbx.com");
  return isMetaProtected;
}

function buildContentDisposition(fileName: string | null, previewable: boolean): string {
  const fallbackName =
    (fileName || "arquivo")
      .replace(/[\\/\r\n"<>:*?|]/g, "_")
      .trim() || "arquivo";
  const encoded = encodeURIComponent(fallbackName);
  const mode = previewable ? "inline" : "attachment";
  return `${mode}; filename="${fallbackName}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const waId = (searchParams.get("wa_id") || "").trim();
  const fileId = (searchParams.get("file_id") || "").trim();

  if (!waId || !fileId) {
    return NextResponse.json(
      { ok: false, error: "wa_id e file_id são obrigatórios" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);
  if (missingEnvs.length > 0) {
    return NextResponse.json(
      { ok: false, error: `missing env: ${missingEnvs.join(", ")}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

    const endpoint = new URL("/rest/v1/enova_docs", supabaseUrl);
    endpoint.searchParams.set(
      "select",
      "wa_id,tipo,participante,status,created_at,url,document_url,download_url,media_url,link,mime_type,mimetype,file_name,filename,size,file_size,bytes,tamanho",
    );
    endpoint.searchParams.set("wa_id", `eq.${waId}`);
    endpoint.searchParams.set("order", "created_at.asc");
    endpoint.searchParams.set("limit", "200");

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `failed to load files (${response.status})` },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rows = (await response.json()) as EnovaDocRow[];
    const resolved = resolveCaseFileById(waId, fileId, rows);
    if (!resolved) {
      return NextResponse.json(
        { ok: false, error: "arquivo não encontrado" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!isAllowedFileOrigin(resolved.sourceUrl, supabaseUrl)) {
      return NextResponse.json(
        { ok: false, error: "origem de arquivo não permitida" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const upstream = await fetch(resolved.sourceUrl, {
      method: "GET",
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { ok: false, error: "arquivo indisponível para abertura" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const contentType =
      resolved.item.mime_type ||
      upstream.headers.get("content-type") ||
      "application/octet-stream";
    const contentLength =
      resolved.item.size_bytes !== null
        ? String(resolved.item.size_bytes)
        : upstream.headers.get("content-length");

    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      buildContentDisposition(resolved.item.file_name, resolved.item.previewable),
    );
    if (contentLength) headers.set("Content-Length", contentLength);
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("case-files/open internal error", error);
    return NextResponse.json(
      { ok: false, error: "internal error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
