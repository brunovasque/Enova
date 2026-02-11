import { NextResponse } from "next/server";

type HealthResponse = {
  ok: boolean;
  db_ok: boolean;
  worker_ok: boolean;
  env: {
    hasSupabaseUrl: boolean;
    hasServiceRole: boolean;
    hasAdminKey: boolean;
    workerBaseHost: string | null;
  };
  worker: {
    endpointTested: string;
    status: number | null;
    error: string | null;
  };
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
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  try {
    const response = await fetch(new URL("/__admin__/health", workerBaseUrl), {
      method: "GET",
      headers: {
        "x-enova-admin-key": adminKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `worker check failed (${response.status})`,
      };
    }

    return { ok: true, status: response.status, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker check failed";
    return { ok: false, status: null, error: message };
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
    hasAdminKey: Boolean(process.env.ENOVA_ADMIN_KEY),
    workerBaseHost: getWorkerBaseHost(process.env.WORKER_BASE_URL),
  };

  const healthJson = (body: HealthResponse, status: number) =>
    NextResponse.json<HealthResponse>(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    });

  const workerEndpointTested = "/__admin__/health";
  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return healthJson(
      {
        ok: false,
        db_ok: false,
        worker_ok: false,
        env: envInfo,
        worker: {
          endpointTested: workerEndpointTested,
          status: null,
          error: "missing required env",
        },
        error: `missing env: ${missingEnvs.join(", ")}`,
      },
      500,
    );
  }

  try {
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

    return healthJson(
      {
        ok,
        db_ok: dbResult.ok,
        worker_ok: workerResult.ok,
        env: envInfo,
        worker: {
          endpointTested: workerEndpointTested,
          status: workerResult.status,
          error: workerResult.error,
        },
        error,
      },
      ok ? 200 : 503,
    );
  } catch {
    return healthJson(
      {
        ok: false,
        db_ok: false,
        worker_ok: false,
        env: envInfo,
        worker: {
          endpointTested: workerEndpointTested,
          status: null,
          error: "health check failed",
        },
        error: "health check failed",
      },
      500,
    );
  }
}
