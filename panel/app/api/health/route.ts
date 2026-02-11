import { NextResponse } from "next/server";

type HealthResponse = {
  ok: boolean;
  db_ok: boolean;
  worker_ok: boolean;
  env: {
    hasSupabaseUrl: boolean;
    hasServiceRole: boolean;
    workerBaseHost: string | null;
  };
  worker_build?: unknown;
  error?: string;
};

const REQUIRED_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE",
  "WORKER_BASE_URL",
  "ENOVA_ADMIN_KEY",
] as const;

async function checkSupabase(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(new URL("/sql/v1", supabaseUrl), {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "select 1" }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: `supabase query failed (${response.status})` };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "supabase check failed" };
  }
}

async function checkWorker(
  workerBaseUrl: string,
  adminKey: string,
): Promise<{ ok: boolean; build?: unknown; error?: string }> {
  try {
    const response = await fetch(new URL("/__build", workerBaseUrl), {
      method: "GET",
      headers: {
        "x-enova-admin-key": adminKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: `worker check failed (${response.status})` };
    }

    const build = await response.json();
    return { ok: true, build };
  } catch {
    return { ok: false, error: "worker check failed" };
  }
}

function getWorkerBaseHost(workerBaseUrl: string | undefined): string | null {
  if (!workerBaseUrl) {
    return null;
  }

  try {
    return new URL(workerBaseUrl).hostname;
  } catch {
    return null;
  }
}

export async function GET() {
  const envInfo = {
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE),
    workerBaseHost: getWorkerBaseHost(process.env.WORKER_BASE_URL),
  };

  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return NextResponse.json<HealthResponse>(
      {
        ok: false,
        db_ok: false,
        worker_ok: false,
        env: envInfo,
        error: `missing env: ${missingEnvs.join(", ")}`,
      },
      { status: 500 },
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;
  const workerBaseUrl = process.env.WORKER_BASE_URL as string;
  const adminKey = process.env.ENOVA_ADMIN_KEY as string;

  const [dbResult, workerResult] = await Promise.all([
    checkSupabase(supabaseUrl, serviceRoleKey),
    checkWorker(workerBaseUrl, adminKey),
  ]);

  const ok = dbResult.ok && workerResult.ok;
  const error = [dbResult.error, workerResult.error].filter(Boolean).join("; ") || undefined;

  return NextResponse.json<HealthResponse>(
    {
      ok,
      db_ok: dbResult.ok,
      worker_ok: workerResult.ok,
      env: envInfo,
      worker_build: workerResult.build,
      error,
    },
    { status: ok ? 200 : 503 },
  );
}
