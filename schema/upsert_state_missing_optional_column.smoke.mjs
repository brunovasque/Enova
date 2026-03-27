import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const { upsertState } = workerModule;

function buildMissingColumnError(column) {
  const err = new Error("Supabase proxy HTTP error");
  err.status = 400;
  err.data = {
    message: `Could not find the '${column}' column of 'enova_state' in the schema cache`
  };
  return err;
}

function buildEnvForInsertFallback(missingColumns = []) {
  const calls = [];
  return {
    env: {
      ENV_MODE: "test",
      VERCEL_PROXY_URL: "https://proxy.example"
    },
    fetchImpl: async (_url, init = {}) => {
      const method = String(init?.method || "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, body });
      if (method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (method === "POST") {
        const row = Array.isArray(body) ? body[0] : body;
        for (const missingColumn of missingColumns) {
          if (Object.prototype.hasOwnProperty.call(row || {}, missingColumn)) {
            return new Response(
              JSON.stringify({
                message: `Could not find the '${missingColumn}' column of 'enova_state' in the schema cache`
              }),
              { status: 400, headers: { "content-type": "application/json" } }
            );
          }
        }
        return new Response(JSON.stringify([row]), { status: 201, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected method in insert fallback scenario: ${method}`);
    },
    calls
  };
}

function buildEnvForUpdateFallback(missingColumns = []) {
  const calls = [];
  return {
    env: {
      ENV_MODE: "test",
      VERCEL_PROXY_URL: "https://proxy.example"
    },
    fetchImpl: async (_url, init = {}) => {
      const method = String(init?.method || "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, body });
      if (method === "GET") {
        return new Response(
          JSON.stringify([{ wa_id: "5541991110002", fase_conversa: "envio_docs" }]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (method === "PATCH") {
        for (const missingColumn of missingColumns) {
          if (Object.prototype.hasOwnProperty.call(body || {}, missingColumn)) {
            return new Response(
              JSON.stringify({
                message: `Could not find the '${missingColumn}' column of 'enova_state' in the schema cache`
              }),
              { status: 400, headers: { "content-type": "application/json" } }
            );
          }
        }
        return new Response(JSON.stringify([body]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected method in update fallback scenario: ${method}`);
    },
    calls
  };
}

// 1) insert fallback com last_message_id_prev ausente
{
  const { env, fetchImpl, calls } = buildEnvForInsertFallback(["last_message_id_prev"]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await upsertState(env, "5541991110001", {
      fase_conversa: "inicio",
      last_message_id_prev: "wamid.prev.1",
      last_message_timestamp: null,
      envio_docs_status: "pendente"
    });
    assert.equal(result?.wa_id, "5541991110001");
    assert.equal(result?.fase_conversa, "inicio");
    assert.equal(result?.envio_docs_status, "pendente");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_id_prev"), false);
    const postCalls = calls.filter((c) => c.method === "POST");
    assert.equal(postCalls.length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[0].body || [])[0] || {}, "last_message_id_prev"), true);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[0].body || [])[0] || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[1].body || [])[0] || {}, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[1].body || [])[0] || {}, "last_message_timestamp"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 2) insert fallback com last_message_timestamp ausente
{
  const { env, fetchImpl, calls } = buildEnvForInsertFallback(["last_message_timestamp"]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await upsertState(env, "5541991110004", {
      fase_conversa: "inicio",
      last_message_timestamp: "2026-03-27T23:00:00.000Z",
      envio_docs_status: "pendente"
    });
    assert.equal(result?.wa_id, "5541991110004");
    assert.equal(result?.fase_conversa, "inicio");
    assert.equal(result?.envio_docs_status, "pendente");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_timestamp"), false);
    const postCalls = calls.filter((c) => c.method === "POST");
    assert.equal(postCalls.length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[0].body || [])[0] || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[1].body || [])[0] || {}, "last_message_timestamp"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 3) insert fallback com ambas ausentes
{
  const { env, fetchImpl, calls } = buildEnvForInsertFallback(["last_message_id_prev", "last_message_timestamp"]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await upsertState(env, "5541991110005", {
      fase_conversa: "inicio",
      last_message_id_prev: "wamid.prev.5",
      last_message_timestamp: "2026-03-27T23:00:00.000Z",
      envio_docs_status: "pendente"
    });
    assert.equal(result?.wa_id, "5541991110005");
    assert.equal(result?.fase_conversa, "inicio");
    assert.equal(result?.envio_docs_status, "pendente");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_timestamp"), false);
    const postCalls = calls.filter((c) => c.method === "POST");
    assert.equal(postCalls.length, 3);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[0].body || [])[0] || {}, "last_message_id_prev"), true);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[0].body || [])[0] || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[1].body || [])[0] || {}, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[1].body || [])[0] || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[2].body || [])[0] || {}, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call((postCalls[2].body || [])[0] || {}, "last_message_timestamp"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 4) update fallback com last_message_id_prev ausente
{
  const { env, fetchImpl, calls } = buildEnvForUpdateFallback(["last_message_id_prev"]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await upsertState(env, "5541991110002", {
      fase_conversa: "envio_docs",
      last_message_id_prev: "wamid.prev.2",
      last_message_timestamp: null,
      envio_docs_status: "em_andamento"
    });
    assert.equal(result?.fase_conversa, "envio_docs");
    assert.equal(result?.envio_docs_status, "em_andamento");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_id_prev"), false);
    const patchCalls = calls.filter((c) => c.method === "PATCH");
    assert.equal(patchCalls.length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[0].body || {}, "last_message_id_prev"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[0].body || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[1].body || {}, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[1].body || {}, "last_message_timestamp"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 5) update fallback com last_message_timestamp ausente
{
  const { env, fetchImpl, calls } = buildEnvForUpdateFallback(["last_message_timestamp"]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await upsertState(env, "5541991110002", {
      fase_conversa: "envio_docs",
      last_message_timestamp: "2026-03-27T23:00:00.000Z",
      envio_docs_status: "em_andamento"
    });
    assert.equal(result?.fase_conversa, "envio_docs");
    assert.equal(result?.envio_docs_status, "em_andamento");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_timestamp"), false);
    const patchCalls = calls.filter((c) => c.method === "PATCH");
    assert.equal(patchCalls.length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[0].body || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[1].body || {}, "last_message_timestamp"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 6) update fallback com ambas ausentes
{
  const { env, fetchImpl, calls } = buildEnvForUpdateFallback(["last_message_id_prev", "last_message_timestamp"]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await upsertState(env, "5541991110002", {
      fase_conversa: "envio_docs",
      last_message_id_prev: "wamid.prev.6",
      last_message_timestamp: "2026-03-27T23:00:00.000Z",
      envio_docs_status: "em_andamento"
    });
    assert.equal(result?.fase_conversa, "envio_docs");
    assert.equal(result?.envio_docs_status, "em_andamento");
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "last_message_timestamp"), false);
    const patchCalls = calls.filter((c) => c.method === "PATCH");
    assert.equal(patchCalls.length, 3);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[0].body || {}, "last_message_id_prev"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[0].body || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[1].body || {}, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[1].body || {}, "last_message_timestamp"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[2].body || {}, "last_message_id_prev"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(patchCalls[2].body || {}, "last_message_timestamp"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 7) outras colunas ausentes continuam falhando (não mascarar erro real)
{
  const env = {
    ENV_MODE: "test",
    VERCEL_PROXY_URL: "https://proxy.example"
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init = {}) => {
    const method = String(init?.method || "GET").toUpperCase();
    if (method === "GET") {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw buildMissingColumnError("coluna_desconhecida");
  };
  try {
    await assert.rejects(
      upsertState(env, "5541991110003", {
        fase_conversa: "inicio",
        coluna_desconhecida: "x"
      }),
      (err) => Number(err?.status) === 400
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log("upsert_state_missing_optional_column.smoke: ok");
