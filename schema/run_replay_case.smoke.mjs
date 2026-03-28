import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

const replayScriptPath = new URL("./run-replay-case.ps1", import.meta.url);

function parseKvLines(stdout) {
  const out = {};
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    out[key] = value;
  }
  return out;
}

const observedRequests = [];

function json(status, body) {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function route(pathname, payload) {
  if (pathname === "/__admin__/replay-webhook-raw") {
    if (payload?.replay_id === "meta_raw_unit_manual_mode_20260320") {
      return json(200, {
        ok: true,
        reason: "manual_mode_bypass",
        stage_before: "envio_docs",
        stage_after: "envio_docs"
      });
    }
    if (payload?.replay_id === "meta_raw_not_found_20260320") {
      return json(200, {
        ok: false,
        reason: "replay_not_found"
      });
    }
    return json(404, { ok: false, reason: "endpoint_not_found" });
  }

  if (pathname === "/__admin__/replay-webhook-sequence") {
    const replayIds = Array.isArray(payload?.replay_ids) ? payload.replay_ids : [];
    if (replayIds[0] === "meta_raw_seq_happy_20260320_1") {
      return json(200, {
        ok: true,
        results: [
          { index: 0, ok: true, reason: "manual_mode_bypass" },
          { index: 1, ok: true, reason: "manual_mode_bypass" }
        ]
      });
    }
    if (replayIds[0] === "meta_raw_seq_details_fallback_20260320") {
      return json(200, {
        ok: true,
        results: [
          { index: 0, ok: true, lookup: { strategy: "fallback_scan" } }
        ]
      });
    }
    if (replayIds[0] === "meta_raw_seq_regression_existing_20260320") {
      return json(200, {
        ok: false,
        failed_index: 1,
        reason: "replay_not_found",
        results: [
          { index: 0, ok: true, reason: "manual_mode_bypass" },
          { index: 1, ok: false, reason: "replay_not_found" }
        ]
      });
    }
    if (replayIds[0] === "meta_raw_seq_investigating_20260328_1") {
      return json(200, {
        ok: true,
        results: [
          { index: 0, ok: true, reason: "manual_mode_bypass" },
          { index: 1, ok: true, reason: "manual_mode_bypass" }
        ]
      });
    }

    if (Array.isArray(payload?.events) && payload.events.length > 0) {
      return json(200, {
        ok: false,
        failed_index: 0,
        reason: "forward_dispatch_error",
        results: [
          { index: 0, ok: false, reason: "forward_dispatch_error" }
        ]
      });
    }

    return json(400, { ok: false, reason: "invalid_payload" });
  }

  if (pathname === "/__admin__/replay-with-state") {
    return json(200, {
      ok: true,
      restored: true,
      result: {
        ok: true,
        reason: "manual_mode_bypass",
        stage_before: "envio_docs",
        stage_after: "envio_docs"
      }
    });
  }

  return json(404, { ok: false, reason: "not_found" });
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    let payload = {};
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      payload = { __invalid: true };
    }
    observedRequests.push({ pathname: req.url, payload, adminKey: req.headers["x-enova-admin-key"] });
    const result = route(req.url, payload);
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  });
});

function runCase(caseId, baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn("pwsh", [
      "-File",
      replayScriptPath.pathname,
      "-CaseId",
      caseId,
      "-BaseUrl",
      baseUrl,
      "-AdminKey",
      "smoke-admin-key"
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        parsed: parseKvLines(stdout)
      });
    });
  });
}

await new Promise((resolve, reject) => {
  server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
});

try {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  // validated (unit/raw)
  const validatedRaw = await runCase("validated_raw_unit_manual_mode", baseUrl);
  assert.equal(validatedRaw.code, 0, validatedRaw.stderr || validatedRaw.stdout);
  assert.equal(validatedRaw.parsed.status, "validated");
  assert.equal(validatedRaw.parsed.mode, "replay_id");
  assert.equal(validatedRaw.parsed.endpoint, "/__admin__/replay-webhook-raw");
  assert.equal(validatedRaw.parsed.ok, "True");

  // regression (sequence)
  const regression = await runCase("regression_sequence_missing_second_capture", baseUrl);
  assert.equal(regression.code, 1, regression.stderr || regression.stdout);
  assert.equal(regression.parsed.status, "regression");
  assert.equal(regression.parsed.endpoint, "/__admin__/replay-webhook-sequence");
  assert.equal(regression.parsed.failed_index, "1");
  assert.match(regression.parsed.reason, /replay_not_found/);

  // expected_failure (should still exit zero)
  const expectedFailure = await runCase("expected_failure_invalid_events_json", baseUrl);
  assert.equal(expectedFailure.code, 0, expectedFailure.stderr || expectedFailure.stdout);
  assert.equal(expectedFailure.parsed.status, "expected_failure");
  assert.equal(expectedFailure.parsed.endpoint, "/__admin__/replay-webhook-sequence");
  assert.equal(expectedFailure.parsed.ok, "False");
  assert.equal(expectedFailure.parsed.failed_index, "0");

  // replay with state
  const withState = await runCase("validated_with_state_restore", baseUrl);
  assert.equal(withState.code, 0, withState.stderr || withState.stdout);
  assert.equal(withState.parsed.status, "validated");
  assert.equal(withState.parsed.endpoint, "/__admin__/replay-with-state");
  assert.equal(withState.parsed.ok, "True");

  // investigating warning + endpoint
  const investigating = await runCase("investigating_sequence_candidate", baseUrl);
  assert.equal(investigating.code, 0, investigating.stderr || investigating.stdout);
  assert.match(investigating.stdout, /WARNING: case status = investigating/i);
  assert.equal(investigating.parsed.status, "investigating");
  assert.equal(investigating.parsed.endpoint, "/__admin__/replay-webhook-sequence");

  // Ensure admin key header is sent
  assert.ok(observedRequests.every((entry) => entry.adminKey === "smoke-admin-key"));
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
}

console.log("run_replay_case.smoke: ok");
