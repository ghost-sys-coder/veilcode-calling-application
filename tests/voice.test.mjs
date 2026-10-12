import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Load the actual TypeScript modules with explicit mocks for external services.
function loadModule(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const loadedModule = { exports: {} };
  const load = (name) => Object.hasOwn(imports, name) ? imports[name] : require(name);
  new Function("require", "module", "exports", outputText)(load, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const countries = loadModule("../src/lib/calling-countries.ts");
const { normalizeDialingNumber } = countries;
const outcomeModule = loadModule("../src/lib/voice-outcome.ts");

test("normalizes US and Canadian national and formatted international numbers", () => {
  assert.equal(normalizeDialingNumber("(212) 555-0123", "US"), "+12125550123");
  assert.equal(normalizeDialingNumber("+1 (212) 555-0123", "US"), "+12125550123");
  assert.equal(normalizeDialingNumber("416 555 0123", "CA"), "+14165550123");
});

test("normalizes UK local trunk prefix and international numbers", () => {
  assert.equal(normalizeDialingNumber("020 7946 0123", "GB"), "+442079460123");
  assert.equal(normalizeDialingNumber("+44 20 7946 0123", "GB"), "+442079460123");
});

test("rejects countries that do not match the selection, including shared +1 codes", () => {
  assert.equal(normalizeDialingNumber("+442079460123", "US"), null);
  assert.equal(normalizeDialingNumber("+14165550123", "US"), null);
  assert.equal(normalizeDialingNumber("+12125550123", "CA"), null);
});

test("rejects incomplete, unsupported and extension inputs", () => {
  for (const value of ["", "+1", "+44", "call +12125550123", "+12125550123 ext 123", "+33142345678", "1".repeat(31)]) {
    assert.equal(normalizeDialingNumber(value, "US"), null);
  }
});

test("server validation retains premium and recipient allowlist restrictions", () => {
  const { validateCallingDestination } = loadModule("../src/lib/destination.ts", {
    "server-only": {}, "@/lib/calling-countries": countries,
  });
  const previous = process.env.TWILIO_ALLOWED_DESTINATIONS;
  try {
    delete process.env.TWILIO_ALLOWED_DESTINATIONS;
    assert.equal(validateCallingDestination("+12125550123"), "+12125550123");
    assert.equal(validateCallingDestination("+14165550123"), "+14165550123");
    assert.equal(validateCallingDestination("+442079460123"), "+442079460123");
    assert.equal(validateCallingDestination("+19005550123"), null);
    assert.equal(validateCallingDestination("+447012345678"), null);
    process.env.TWILIO_ALLOWED_DESTINATIONS = "+442079460123";
    assert.equal(validateCallingDestination("+12125550123"), null);
    assert.equal(validateCallingDestination("+442079460123"), "+442079460123");
  } finally {
    if (previous === undefined) delete process.env.TWILIO_ALLOWED_DESTINATIONS;
    else process.env.TWILIO_ALLOWED_DESTINATIONS = previous;
  }
});

const callSid = `CA${"a".repeat(32)}`;
const childSid = `CA${"b".repeat(32)}`;

function statusRoute({ userId = "user_operator", approved = true, from = "client:user_operator", parentStatus = "failed", children = [{ sid: childSid, status: "failed" }], parentErrors = [{ errorCode: "13225", messageText: "private log data" }], childErrors = [], parentCallSid = null, unavailable = false } = {}) {
  let reads = 0;
  const calls = (sid) => ({
    fetch: async () => {
      reads += 1;
      if (unavailable) throw new Error("private credential or provider detail");
      return { from, status: parentStatus, parentCallSid };
    },
    notifications: { list: async () => sid === callSid ? parentErrors : childErrors },
  });
  calls.list = async () => { reads += 1; return children; };
  const route = loadModule("../src/app/api/voice/status/route.ts", {
    "@clerk/nextjs/server": { auth: async () => ({ userId }) },
    twilio: () => ({ calls }),
    "@/lib/access": { isApprovedOperator: () => approved },
    "@/lib/voice-config": { getVoiceConfig: () => ({ accountSid: "test", authToken: "test" }) },
    "@/lib/voice-outcome": outcomeModule,
    "@/lib/voice-responses": { voiceJson: (data, status = 200) => Response.json(data, { status }) },
  });
  return { get: (sid = callSid) => route.GET(new Request(`https://example.test/api/voice/status?callSid=${sid}`)), reads: () => reads };
}

test("status API rejects unauthenticated and unapproved users before reading Twilio", async () => {
  for (const [options, expected] of [[{ userId: null }, 401], [{ approved: false }, 403]]) {
    const route = statusRoute(options);
    assert.equal((await route.get()).status, expected);
    assert.equal(route.reads(), 0);
  }
});

test("status API rejects invalid call identifiers", async () => {
  const route = statusRoute();
  assert.equal((await route.get("invalid")).status, 400);
  assert.equal(route.reads(), 0);
});

test("status API hides other operators' calls and telephone child calls", async () => {
  for (const options of [{ from: "client:user_other" }, { parentCallSid: callSid }]) {
    const route = statusRoute(options);
    assert.equal((await route.get()).status, 404);
    assert.equal(route.reads(), 1);
  }
});

test("surfaces Twilio 13225 from parent notifications without exposing raw logs", async () => {
  const response = await statusRoute().get();
  const body = await response.json();
  assert.equal(body.errorCode, "13225");
  assert.equal(body.failed, true);
  assert.equal(body.pending, false);
  assert.match(body.message, /Twilio blocked/);
  assert.ok(!JSON.stringify(body).includes("private log data"));
});

test("uses telephone child status even when the browser parent completed", async () => {
  const body = await (await statusRoute({ parentStatus: "completed", parentErrors: [] }).get()).json();
  assert.equal(body.status, "failed");
  assert.equal(body.failed, true);
  assert.equal(body.pending, true);
});

test("reads error notifications attached to the telephone child", async () => {
  const body = await (await statusRoute({ parentErrors: [], childErrors: [{ errorCode: "13224" }] }).get()).json();
  assert.equal(body.errorCode, "13224");
  assert.match(body.message, /phone number/);
});

test("reports busy, no answer, canceled and completed results", async () => {
  for (const status of ["busy", "no-answer", "canceled", "completed"]) {
    const body = await (await statusRoute({ children: [{ sid: childSid, status }], parentErrors: [] }).get()).json();
    assert.equal(body.status, status);
    assert.equal(body.failed, false);
    assert.equal(body.pending, false);
  }
});

test("does not claim telephone completion when only a parent call is available", async () => {
  const body = await (await statusRoute({ parentStatus: "completed", children: [], parentErrors: [] }).get()).json();
  assert.equal(body.status, "unknown");
  assert.equal(body.pending, true);
});

test("provider failures return a safe diagnostic response", async () => {
  const response = await statusRoute({ unavailable: true }).get();
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private credential"));
});
