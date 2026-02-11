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
    endpointTested: "/__admin__/health";
    status: number | null;
    error: string | null;
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
    const response = await fetch(
      new URL("/rest/v1/enova_state?select=*&limit=1", supabaseUrl),
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      },
    );

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
): Promise<{ ok: boolean; status: number | null; build?: unknown; error: string | null }> {
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

    const build = await response.json();
    return { ok: true, status: response.status, build, error: null };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "worker check failed",
    };
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

  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return healthJson(
      {
        ok: false,
        db_ok: false,
        worker_ok: false,
        env: envInfo,
        worker: {
          endpointTested: "/__admin__/health",
          status: null,
          error: null,
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
          endpointTested: "/__admin__/health",
          status: workerResult.status,
          error: workerResult.error,
        },
        worker_build: workerResult.build,
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
          endpointTested: "/__admin__/health",
          status: null,
          error: null,
        },
        error: "health check failed",
      },
      500,
    );
  }
}
