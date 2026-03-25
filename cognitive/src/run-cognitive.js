import { READ_ONLY_COGNITIVE_FIXTURES } from "../fixtures/read-only-cases.js";

const REQUIRED_RESPONSE_FIELDS = Object.freeze([
  "reply_text",
  "slots_detected",
  "pending_slots",
  "conflicts",
  "suggested_next_slot",
  "consultive_notes",
  "should_request_confirmation",
  "should_advance_stage",
  "confidence"
]);

const STAGE_DEFAULT_PENDING_SLOTS = Object.freeze({
  estado_civil: ["estado_civil", "composicao"],
  somar_renda_solteiro: ["composicao", "familiar", "renda"],
  somar_renda_familiar: ["familiar", "p3"],
  regime_trabalho: ["regime_trabalho", "renda", "ir_declarado"],
  autonomo_ir_pergunta: ["ir_declarado", "renda"],
  renda: ["renda", "ir_declarado"]
});

const MONEY_REGEX = /(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|(?:r\$\s*)?\d+(?:,\d{2})?/gi;
const OFFTRACK_HINTS = /\b(valor|entrada|parcela|imovel|imóvel|casa|apartamento|bairro|regiao|região|metros)\b/i;
const AMBIGUOUS_HINTS = /\b(acho|talvez|mais ou menos|nao sei|não sei|meio|duvida|dúvida)\b/i;
const CONFIRMATION_SLOT_KEYS = new Set(["p3"]);
const ESTADO_CIVIL_CONFIDENCE = Object.freeze({
  default: 0.88,
  ambiguous: 0.41
});
const CONFIDENCE_RULES = Object.freeze({
  detectedBase: 0.58,
  detectedIncrement: 0.1,
  noSlotBase: 0.32,
  conflictPenalty: 0.22,
  offtrackPenalty: 0.08,
  offtrackBase: 0.58
});

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRequest(input = {}) {
  const context = input?.context && typeof input.context === "object" ? input.context : {};
  const message = input?.message && typeof input.message === "object" ? input.message : {};
  const knownSlotsRaw = input?.known_slots ?? context?.known_slots;
  const pendingSlotsRaw = input?.pending_slots ?? context?.pending_slots;
  const recentMessagesRaw = input?.recent_messages ?? context?.recent_messages;
  const normalized = {
    version: String(input?.version || "read_only_test_v1"),
    channel: String(input?.channel || "meta_whatsapp"),
    conversation_id: String(input?.conversation_id || message?.id || "cognitive-test"),
    current_stage: String(input?.current_stage || context?.current_stage || "inicio"),
    message_text: String(input?.message_text || message?.text || ""),
    known_slots:
      knownSlotsRaw && typeof knownSlotsRaw === "object" && !Array.isArray(knownSlotsRaw)
        ? cloneJson(knownSlotsRaw)
        : {},
    pending_slots: Array.isArray(pendingSlotsRaw) ? [...pendingSlotsRaw] : [],
    recent_messages: Array.isArray(recentMessagesRaw)
      ? recentMessagesRaw.map((entry) => {
          if (typeof entry === "string") return { role: "user", text: entry };
          return {
            role: String(entry?.role || "user"),
            text: String(entry?.text || "")
          };
        })
      : []
  };

  return normalized;
}

function pickDetectedValue(text, pairs) {
  for (const pair of pairs) {
    if (pair.regex.test(text)) return pair.value;
  }
  return null;
}

function detectMoney(text) {
  const matches = String(text || "").match(MONEY_REGEX);
  if (!matches || !matches.length) return null;
  const parsedValues = matches
    .map((match) => {
      const raw = match.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value) => Number.isFinite(value));

  if (!parsedValues.length) return null;
  return parsedValues.sort((a, b) => b - a)[0];
}

function detectEstadoCivil(text) {
  if (/\buniao estavel\b|\buni[aã]o est[aá]vel\b|\bmoro junto\b/.test(text)) return "uniao_estavel";
  if (/\bcasad[oa]\b/.test(text)) return "casado_civil";
  if (/\bsolteir[oa]\b/.test(text)) return "solteiro";
  return null;
}

function detectRegime(text) {
  return pickDetectedValue(text, [
    { regex: /\bclt\b|\bcarteira assinada\b|\bregistrad[oa]\b/, value: "clt" },
    { regex: /\bautonom[oa]\b|\baut[oô]nomo\b|\bpor conta\b/, value: "autonomo" },
    { regex: /\bservidor\b/, value: "servidor" },
    { regex: /\baposentad[oa]\b/, value: "aposentado" }
  ]);
}

function detectIr(text) {
  if (/\bnao declaro ir\b|\bnão declaro ir\b|\bsem declarar ir\b|\bnao declaro imposto\b|\bnão declaro imposto\b/.test(text)) {
    return "nao";
  }
  if (/\bdeclaro ir\b|\bdeclaro imposto\b|\bfaço imposto de renda\b|\bfa[oç]o ir\b/.test(text)) {
    return "sim";
  }
  return null;
}

function detectComposicao(text) {
  if (/\bsozinh[oa]\b|\bs[oó] eu\b|\bs[oó] minha renda\b/.test(text)) return { tipo: "sozinho" };
  if (/\besposa\b|\bmarido\b|\bconjuge\b|\bc[oô]njuge\b|\bparceir[oa]\b/.test(text)) {
    return { tipo: "parceiro", label: "parceiro" };
  }
  if (/\bmae\b|\bm[aã]e\b|\bpai\b|\birmao\b|\birm[aã]o\b|\bavo\b|\bav[oó]\b|\btio\b|\btia\b|\bprima?\b|\bprimo\b|\bfamiliar\b/.test(text)) {
    return { tipo: "familiar", label: "familiar" };
  }
  return null;
}

function detectFamiliar(text) {
  return pickDetectedValue(text, [
    { regex: /\bm[aã]e\b/, value: "mae" },
    { regex: /\bpai\b/, value: "pai" },
    { regex: /\birm[aã]o\b/, value: "irmao" },
    { regex: /\birm[aã]\b/, value: "irma" },
    { regex: /\bav[oó]\b/, value: "avo" },
    { regex: /\btio\b/, value: "tio" },
    { regex: /\btia\b/, value: "tia" },
    { regex: /\bprimo\b/, value: "primo" },
    { regex: /\bprima\b/, value: "prima" },
    { regex: /\bfamiliar\b/, value: "familiar_nao_especificado" }
  ]);
}

function detectP3(text) {
  if (/\bseremos tres\b|\bseremos 3\b|\bp3\b|\bterceira pessoa\b|\bmais uma pessoa\b/.test(text)) return "sim";
  const familyCount = (text.match(/\bm[aã]e\b|\bpai\b|\birm[aã]o\b|\birm[aã]\b|\bav[oó]\b|\btio\b|\btia\b|\bprima\b|\bprimo\b/g) || []).length;
  if (familyCount >= 2) return "sim";
  return null;
}

function buildSlot(value, confidence, evidence, source = "message_text") {
  return { value, confidence, evidence, source };
}

function detectSlotsFromConversation(request) {
  const combinedText = [request.message_text, ...request.recent_messages.map((entry) => entry.text)]
    .filter(Boolean)
    .join(" | ");
  const normalized = normalizeText(combinedText);
  const slotsDetected = {};
  const consultiveNotes = [];
  const conflicts = [];

  const estadoCivil = detectEstadoCivil(normalized);
  const regimeTrabalho = detectRegime(normalized);
  const renda = detectMoney(combinedText);
  const irDeclarado = detectIr(normalized);
  const composicao = detectComposicao(normalized);
  const familiar = detectFamiliar(normalized);
  const p3 = detectP3(normalized);
  const offtrack = OFFTRACK_HINTS.test(normalized);
  const ambiguous = AMBIGUOUS_HINTS.test(normalized);

  if (estadoCivil) {
    slotsDetected.estado_civil = buildSlot(
      estadoCivil,
      ambiguous ? ESTADO_CIVIL_CONFIDENCE.ambiguous : ESTADO_CIVIL_CONFIDENCE.default,
      request.message_text
    );
  }
  if (regimeTrabalho) {
    slotsDetected.regime_trabalho = buildSlot(regimeTrabalho, 0.87, request.message_text);
  }
  if (Number.isFinite(renda)) {
    slotsDetected.renda = buildSlot(renda, 0.84, request.message_text);
  }
  if (irDeclarado) {
    slotsDetected.ir_declarado = buildSlot(irDeclarado, 0.91, request.message_text);
  }
  if (composicao) {
    slotsDetected.composicao = buildSlot(composicao.tipo, composicao.tipo === "familiar" ? 0.83 : 0.86, request.message_text);
  }
  if (familiar) {
    slotsDetected.familiar = buildSlot(familiar, 0.82, request.message_text);
  }
  if (p3) {
    slotsDetected.p3 = buildSlot(p3, 0.68, request.message_text);
    consultiveNotes.push("Há indício de composição com P3; manter a validação apenas em modo consultivo.");
  }

  if (ambiguous) {
    conflicts.push({
      slot: "ambiguous_answer",
      reason: "A resposta contém termos ambíguos e precisa de confirmação humana."
    });
  }

  if (offtrack) {
    consultiveNotes.push("Cliente trouxe dúvida fora do fluxo; responder consultivamente e retornar ao stage atual.");
  }

  return {
    normalized_text: normalized,
    slots_detected: slotsDetected,
    consultive_notes: consultiveNotes,
    conflicts,
    offtrack,
    ambiguous
  };
}

function detectKnownSlotConflicts(knownSlots, detectedSlots) {
  const conflicts = [];
  for (const [slot, detected] of Object.entries(detectedSlots)) {
    const existing = knownSlots?.[slot];
    if (!existing) continue;
    const knownValue = typeof existing === "object" && existing !== null && "value" in existing ? existing.value : existing;
    if (knownValue == null) continue;
    if (String(knownValue) !== String(detected.value)) {
      conflicts.push({
        slot,
        reason: `Valor detectado (${detected.value}) diverge do valor já conhecido (${knownValue}).`
      });
    }
  }
  return conflicts;
}

function buildPendingSlots(request, detectedSlots) {
  const seed = request.pending_slots.length
    ? request.pending_slots
    : STAGE_DEFAULT_PENDING_SLOTS[request.current_stage] || [];
  return [...new Set(seed.filter((slot) => !detectedSlots[slot]))];
}

function buildSuggestedNextSlot(pendingSlots, conflicts) {
  if (conflicts.some((conflict) => conflict.slot === "ambiguous_answer")) return "confirmacao_humana";
  return pendingSlots[0] || null;
}

function buildReplyText({ request, detectedSlots, pendingSlots, suggestedNextSlot, conflicts, offtrack }) {
  if (offtrack) {
    const nextSlotLabel = suggestedNextSlot || request.current_stage;
    return `Posso te orientar nisso de forma consultiva, mas neste teste read-only eu não avanço o fluxo real. Para seguir com segurança, me confirma primeiro o ponto de ${nextSlotLabel}.`;
  }

  if (conflicts.length) {
    return "Entendi sua resposta, mas ela ficou ambígua para o motor cognitivo de teste. Vou marcar a necessidade de confirmação antes de sugerir qualquer próximo passo.";
  }

  const detectedKeys = Object.keys(detectedSlots);
  if (!detectedKeys.length) {
    return "Recebi sua mensagem no runner read-only, mas ainda não identifiquei slot suficiente para sugerir avanço. Posso seguir de forma consultiva sem tocar no fluxo real.";
  }

  if (detectedKeys.length > 2) {
    return "Perfeito — consegui detectar múltiplos sinais na mesma frase em modo read-only. Vou devolver tudo estruturado para teste, sem alterar o funil real.";
  }

  return "Perfeito — capturei o sinal principal da sua mensagem em modo read-only e devolvi a leitura estruturada do cognitivo para validação.";
}

export function validateReadOnlyCognitiveResponse(response) {
  const errors = [];
  const value = response && typeof response === "object" ? response : null;

  if (!value) errors.push("response must be an object");
  for (const field of REQUIRED_RESPONSE_FIELDS) {
    if (!value || !(field in value)) errors.push(`missing field: ${field}`);
  }

  if (value && typeof value.reply_text !== "string") errors.push("reply_text must be a string");
  if (value && (!value.slots_detected || typeof value.slots_detected !== "object" || Array.isArray(value.slots_detected))) {
    errors.push("slots_detected must be an object");
  }
  if (value && !Array.isArray(value.pending_slots)) errors.push("pending_slots must be an array");
  if (value && !Array.isArray(value.conflicts)) errors.push("conflicts must be an array");
  if (value && !(typeof value.suggested_next_slot === "string" || value.suggested_next_slot === null)) {
    errors.push("suggested_next_slot must be string|null");
  }
  if (value && !Array.isArray(value.consultive_notes)) errors.push("consultive_notes must be an array");
  if (value && typeof value.should_request_confirmation !== "boolean") {
    errors.push("should_request_confirmation must be boolean");
  }
  if (value && value.should_advance_stage !== false) errors.push("should_advance_stage must be false");
  if (value && (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
    errors.push("confidence must be a number between 0 and 1");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function listReadOnlyCognitiveFixtures() {
  return READ_ONLY_COGNITIVE_FIXTURES.map((fixture) => ({
    id: fixture.id,
    title: fixture.title,
    current_stage: fixture.input.current_stage
  }));
}

export function getReadOnlyCognitiveFixtureById(fixtureId) {
  if (!fixtureId) return null;
  return READ_ONLY_COGNITIVE_FIXTURES.find((fixture) => fixture.id === fixtureId) || null;
}

export function runReadOnlyCognitiveEngine(rawInput = {}) {
  const request = normalizeRequest(rawInput);
  const analysis = detectSlotsFromConversation(request);
  const knownSlotConflicts = detectKnownSlotConflicts(request.known_slots, analysis.slots_detected);
  const conflicts = [...analysis.conflicts, ...knownSlotConflicts];
  const pendingSlots = buildPendingSlots(request, analysis.slots_detected);
  const suggestedNextSlot = buildSuggestedNextSlot(pendingSlots, conflicts);
  const slotsDetectedCount = Object.keys(analysis.slots_detected).length;
  const shouldRequestConfirmation =
    conflicts.length > 0 ||
    slotsDetectedCount > 3 ||
    Object.keys(analysis.slots_detected).some((slot) => CONFIRMATION_SLOT_KEYS.has(slot));

  const consultiveNotes = [...analysis.consultive_notes];
  if (slotsDetectedCount > 2) {
    consultiveNotes.push("A resposta concentrou múltiplos slots; revisar a ordem canônica apenas fora do fluxo real.");
  }
  if (suggestedNextSlot) {
    consultiveNotes.push(`Próximo slot sugerido em modo read-only: ${suggestedNextSlot}.`);
  }
  consultiveNotes.push("Runner isolado: sem write oficial, sem Meta real e sem alteração de stage.");

  const confidenceBase = slotsDetectedCount
    ? CONFIDENCE_RULES.detectedBase + Math.min(slotsDetectedCount, 4) * CONFIDENCE_RULES.detectedIncrement
    : (analysis.offtrack ? CONFIDENCE_RULES.offtrackBase : CONFIDENCE_RULES.noSlotBase);
  const confidencePenalty =
    conflicts.length * CONFIDENCE_RULES.conflictPenalty +
    (analysis.offtrack ? CONFIDENCE_RULES.offtrackPenalty : 0);
  const confidence = Math.max(0.05, Math.min(0.99, Number((confidenceBase - confidencePenalty).toFixed(2))));

  const response = {
    reply_text: buildReplyText({
      request,
      detectedSlots: analysis.slots_detected,
      pendingSlots,
      suggestedNextSlot,
      conflicts,
      offtrack: analysis.offtrack
    }),
    slots_detected: analysis.slots_detected,
    pending_slots: pendingSlots,
    conflicts,
    suggested_next_slot: suggestedNextSlot,
    consultive_notes: consultiveNotes,
    should_request_confirmation: shouldRequestConfirmation,
    should_advance_stage: false,
    confidence
  };

  const validation = validateReadOnlyCognitiveResponse(response);

  return {
    ok: validation.valid,
    mode: "read_only_test",
    request,
    response,
    validation
  };
}

function parseCliArgs(argv) {
  const parsed = {};
  for (const rawArg of argv) {
    if (!rawArg.startsWith("--")) continue;
    const [key, ...rest] = rawArg.slice(2).split("=");
    parsed[key] = rest.length ? rest.join("=") : true;
  }
  return parsed;
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args["list-fixtures"]) {
    console.log(JSON.stringify({ ok: true, fixtures: listReadOnlyCognitiveFixtures() }, null, 2));
    return;
  }

  if (typeof args.fixture === "string") {
    const fixture = getReadOnlyCognitiveFixtureById(args.fixture);
    if (!fixture) {
      console.error(JSON.stringify({ ok: false, error: "fixture_not_found", fixture_id: args.fixture }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(runReadOnlyCognitiveEngine(fixture.input), null, 2));
    return;
  }

  if (typeof args.json === "string") {
    console.log(JSON.stringify(runReadOnlyCognitiveEngine(JSON.parse(args.json)), null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: false,
        error: "usage",
        details: "Use --list-fixtures, --fixture=<id> ou --json='<payload>'."
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  /run-cognitive\.js$/.test(process.argv[1])
) {
  await runCli();
}
