import { headers } from "next/headers";

type HealthPayload = {
  ok: boolean;
  db_ok: boolean;
  worker_ok: boolean;
  env?: {
    hasAdminKey?: boolean;
  };
  worker?: {
    status: number | null;
  };
  error?: string;
};

type Conversation = {
  id: string;
  wa_id: string;
  nome: string | null;
  last_message_text: string | null;
  fase_conversa: string | null;
  updated_at: string | null;
};

type ConversationsPayload = {
  ok: boolean;
  conversations: Conversation[];
  error?: string;
};

function getBaseUrl() {
  const requestHeaders = headers();
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

async function loadHealth(baseUrl: string): Promise<{ data: HealthPayload | null; error: string | null }> {
  try {
    const response = await fetch(`${baseUrl}/api/health?ts=1`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return { data: null, error: `Falha ao carregar health (${response.status})` };
    }

    const data = (await response.json()) as HealthPayload;
    return { data, error: null };
  } catch {
    return { data: null, error: "Não foi possível consultar /api/health" };
  }
}

async function loadConversations(
  baseUrl: string,
): Promise<{ data: ConversationsPayload | null; error: string | null }> {
  try {
    const response = await fetch(`${baseUrl}/api/conversations?ts=1`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return { data: null, error: `Falha ao carregar conversas (${response.status})` };
    }

    const data = (await response.json()) as ConversationsPayload;
    return { data, error: null };
  } catch {
    return { data: null, error: "Não foi possível consultar /api/conversations" };
  }
}

export default async function DashboardPage() {
  const baseUrl = getBaseUrl();
  const [healthResult, conversationsResult] = await Promise.all([
    loadHealth(baseUrl),
    loadConversations(baseUrl),
  ]);

  const topConversations = conversationsResult.data?.conversations?.slice(0, 20) ?? [];

  return (
    <main style={{ display: "block", padding: "24px" }}>
      <section className="card" style={{ width: "min(1100px, 100%)", margin: "0 auto" }}>
        <h1>Enova Panel</h1>
        <p style={{ marginBottom: "20px" }}>Dashboard operacional</p>

        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          <article
            style={{
              border: "1px solid #2b3440",
              borderRadius: "10px",
              background: "#0f1620",
              padding: "16px",
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1.05rem" }}>Status</h2>
            {healthResult.error ? (
              <p>{healthResult.error}</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.7 }}>
                <li>ok: {String(healthResult.data?.ok)}</li>
                <li>db_ok: {String(healthResult.data?.db_ok)}</li>
                <li>worker_ok: {String(healthResult.data?.worker_ok)}</li>
                <li>env.hasAdminKey: {String(healthResult.data?.env?.hasAdminKey)}</li>
                <li>worker.status: {String(healthResult.data?.worker?.status ?? "null")}</li>
              </ul>
            )}
          </article>

          <article
            style={{
              border: "1px solid #2b3440",
              borderRadius: "10px",
              background: "#0f1620",
              padding: "16px",
              gridColumn: "1 / -1",
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1.05rem" }}>Conversas (top 20)</h2>
            {conversationsResult.error ? (
              <p>{conversationsResult.error}</p>
            ) : topConversations.length === 0 ? (
              <p>Nenhuma conversa disponível.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #2b3440" }}>
                      <th style={{ padding: "8px" }}>Nome / WA ID</th>
                      <th style={{ padding: "8px" }}>Última mensagem</th>
                      <th style={{ padding: "8px" }}>Fase</th>
                      <th style={{ padding: "8px" }}>Atualizado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topConversations.map((conversation) => (
                      <tr key={conversation.id} style={{ borderBottom: "1px solid #222a34" }}>
                        <td style={{ padding: "8px" }}>
                          <strong>{conversation.nome || "Sem nome"}</strong>
                          <div style={{ color: "#9aabba", fontSize: "0.85rem" }}>{conversation.wa_id}</div>
                        </td>
                        <td style={{ padding: "8px" }}>{conversation.last_message_text || "-"}</td>
                        <td style={{ padding: "8px" }}>{conversation.fase_conversa || "-"}</td>
                        <td style={{ padding: "8px" }}>{conversation.updated_at || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article
            style={{
              border: "1px solid #2b3440",
              borderRadius: "10px",
              background: "#0f1620",
              padding: "16px",
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1.05rem" }}>Ações</h2>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <a
                href="/dashboard?ts=1"
                style={{
                  color: "#e6edf3",
                  textDecoration: "none",
                  border: "1px solid #2b3440",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  background: "#131d29",
                }}
              >
                Atualizar
              </a>
              <a
                href="/api/conversations?ts=1"
                style={{
                  color: "#e6edf3",
                  textDecoration: "none",
                  border: "1px solid #2b3440",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  background: "#131d29",
                }}
              >
                Abrir conversas (JSON)
              </a>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
