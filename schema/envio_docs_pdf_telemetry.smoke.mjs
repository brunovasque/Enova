import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

async function run() {
  const logs = [];
  const originalLog = console.log;
  try {
    console.log = (...args) => {
      logs.push(args.map((part) => String(part)).join(" "));
      originalLog(...args);
    };

    const wa_id = "wa-pdf-telemetry-smoke";
    const env = {
      ENOVA_ADMIN_KEY: "smoke-admin-key",
      TELEMETRIA_LEVEL: "basic",
      ENOVA_ENV: "test",
      __enovaSimulationCtx: {
        active: true,
        dryRun: true,
        stateByWaId: {
          [wa_id]: {
            wa_id,
            fase_conversa: "envio_docs",
            dossie_status: "pronto",
            envio_docs_itens_json: [
              { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: "pendente" }
            ]
          }
        },
        messageLog: [],
        writeLog: [],
        writesByWaId: {},
        suppressExternalSend: true,
        wouldSend: false,
        sendPreview: null
      }
    };

    const payload = {
      wa_id,
      stage: "envio_docs",
      dry_run: true,
      max_steps: 1,
      st_overrides: {
        dossie_status: "pronto"
      },
      incoming_media: {
        type: "document",
        document: {
          id: "media-smoke-ctps",
          mime_type: "application/pdf",
          filename: "ctps_digital.pdf",
          base64: "ZmFrZS1wZGY="
        }
      }
    };

    const req = new Request("https://enova.local/__admin__/simulate-from-state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-enova-admin-key": "smoke-admin-key"
      },
      body: JSON.stringify(payload)
    });
    const resp = await worker.fetch(req, env, { waitUntil() {} });
    assert.equal(resp.status, 200);

    const telemetryEvents = logs
      .filter((line) => line.startsWith("TELEMETRIA-SAFE:"))
      .map((line) => {
        const idx = line.indexOf("{");
        if (idx < 0) return null;
        try {
          return JSON.parse(line.slice(idx));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .map((item) => item.event);

    assert.ok(telemetryEvents.includes("envio_docs_pdf_input_debug"));
    assert.ok(telemetryEvents.includes("envio_docs_pdf_ocr_result_debug"));
    assert.ok(telemetryEvents.includes("envio_docs_pdf_classification_debug"));
    assert.ok(telemetryEvents.includes("envio_docs_pdf_final_decision_debug"));
  } finally {
    console.log = originalLog;
  }
}

await run();
console.log("envio_docs_pdf_telemetry.smoke: ok");
