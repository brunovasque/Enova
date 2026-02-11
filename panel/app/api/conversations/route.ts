import { NextResponse } from "next/server";

type ConversationsResponse = {
  ok: boolean;
  conversations: unknown[];
  error?: string;
};

const REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE"] as const;

const jsonResponse = (body: ConversationsResponse, status: number) =>
  NextResponse.json<ConversationsResponse>(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

export async function GET() {
  const missingEnvs = REQUIRED_ENVS.filter((envName) => !process.env[envName]);

  if (missingEnvs.length > 0) {
    return jsonResponse(
      {
        ok: false,
        conversations: [],
        error: `missing env: ${missingEnvs.join(", ")}`,
      },
      500,
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE as string;

    const response = await fetch(
      new URL("/rest/v1/conversations?select=*&order=created_at.desc", supabaseUrl),
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
      return jsonResponse(
        {
          ok: false,
          conversations: [],
          error: `supabase query failed (${response.status})`,
        },
        502,
      );
    }

    const conversations = (await response.json()) as unknown[];

    return jsonResponse(
      {
        ok: true,
        conversations: Array.isArray(conversations) ? conversations : [],
      },
      200,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        conversations: [],
        error: "failed to load conversations",
      },
      500,
    );
  }
}
