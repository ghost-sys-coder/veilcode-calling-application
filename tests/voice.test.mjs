import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadModule } from "./support/load-typescript.mjs";
import { createHmac } from "node:crypto";

const require = createRequire(import.meta.url);

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

test("normalizes Australian landlines, mobiles and formatted international numbers", () => {
  assert.equal(normalizeDialingNumber("02 5550 0123", "AU"), "+61255500123");
  assert.equal(normalizeDialingNumber("0412 345 678", "AU"), "+61412345678");
  assert.equal(normalizeDialingNumber("+61 (2) 5550-0123", "AU"), "+61255500123");
  assert.equal(normalizeDialingNumber("+61 412 345 678", "AU"), "+61412345678");
});

test("rejects countries that do not match the selection, including shared +1 codes", () => {
  assert.equal(normalizeDialingNumber("+442079460123", "US"), null);
  assert.equal(normalizeDialingNumber("+14165550123", "US"), null);
  assert.equal(normalizeDialingNumber("+12125550123", "CA"), null);
  assert.equal(normalizeDialingNumber("+61412345678", "US"), null);
  assert.equal(normalizeDialingNumber("+442079460123", "AU"), null);
  assert.equal(normalizeDialingNumber("+64 21 123 4567", "AU"), null);
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
    assert.equal(validateCallingDestination("+61255500123"), "+61255500123");
    assert.equal(validateCallingDestination("+61412345678"), "+61412345678");
    assert.equal(validateCallingDestination("+19005550123"), null);
    assert.equal(validateCallingDestination("+447012345678"), null);
    assert.equal(validateCallingDestination("+611900123456"), null);
    assert.equal(validateCallingDestination("+611902123456"), null);
    process.env.TWILIO_ALLOWED_DESTINATIONS = "+442079460123";
    assert.equal(validateCallingDestination("+12125550123"), null);
    assert.equal(validateCallingDestination("+442079460123"), "+442079460123");
    assert.equal(validateCallingDestination("+61412345678"), null);
    process.env.TWILIO_ALLOWED_DESTINATIONS = "+61412345678";
    assert.equal(validateCallingDestination("+61412345678"), "+61412345678");
    assert.equal(validateCallingDestination("+61255500123"), null);
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
    "@/lib/access": { operatorHasAccess: () => approved },
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

const primaryCaller = "+12125550123";
const secondaryCaller = "+256772123456";
const signingSecret = "test-only-signing-secret-with-at-least-32-characters";
const callerIdsModule = loadModule("../src/lib/caller-ids.ts", { "server-only": {} });
const ticketModule = loadModule("../src/lib/call-ticket.ts", { "server-only": {} });

function withCallerConfig(primary, extra, callback) {
  const keys = ["TWILIO_PHONE_NUMBER", "TWILIO_CALLER_IDS"];
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const [key, value] of [[keys[0], primary], [keys[1], extra]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return callback();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
}

test("existing single-number configuration remains the default", () => {
  withCallerConfig(primaryCaller, undefined, () => {
    assert.deepEqual(callerIdsModule.getApprovedCallerIds(), [{ number: primaryCaller, label: "Primary business number" }]);
  });
});

test("caller IDs support additional countries and primary label customization", () => {
  withCallerConfig(primaryCaller, JSON.stringify([
    { number: secondaryCaller, label: "Uganda mobile" },
    { number: primaryCaller, label: "US business" },
  ]), () => {
    const options = callerIdsModule.getApprovedCallerIds();
    assert.deepEqual(options, [
      { number: primaryCaller, label: "US business" },
      { number: secondaryCaller, label: "Uganda mobile" },
    ]);
    assert.equal(callerIdsModule.isApprovedCallerId(secondaryCaller, options), true);
    assert.equal(callerIdsModule.isApprovedCallerId("+442079460123", options), false);
    assert.equal(callerIdsModule.isApprovedCallerId(null, options), false);
  });
});

test("malformed caller configuration fails closed", () => {
  const invalid = ["not JSON", "{}", "[null]", JSON.stringify([{ number: "0750242627", label: "Mobile" }]),
    JSON.stringify([{ number: secondaryCaller, label: "" }]),
    JSON.stringify([{ number: secondaryCaller, label: "A" }, { number: secondaryCaller, label: "B" }])];
  for (const raw of invalid) {
    withCallerConfig(primaryCaller, raw, () => {
      assert.throws(() => callerIdsModule.getApprovedCallerIds(), callerIdsModule.CallerIdConfigurationError);
    });
  }
  withCallerConfig("invalid", "[]", () => {
    assert.throws(() => callerIdsModule.getApprovedCallerIds(), /TWILIO_PHONE_NUMBER/);
  });
});

test("invalid caller configuration disables calling and exposes only the variable name", () => {
  const config = loadModule("../src/lib/voice-config.ts", {
    "server-only": {}, "@/lib/caller-ids": callerIdsModule,
  });
  withCallerConfig(primaryCaller, "secret-invalid-config", () => {
    const status = config.getVoiceConfigStatus();
    assert.equal(status.ready, false);
    assert.ok(status.missing.includes("TWILIO_CALLER_IDS"));
    assert.ok(!JSON.stringify(status).includes("secret-invalid-config"));
    assert.throws(() => config.getVoiceConfig());
  });
});

test("call permits bind the operator, recipient, and selected caller ID", () => {
  const signed = ticketModule.signCallTicket("user_operator", "+442079460123", secondaryCaller, signingSecret);
  const payload = ticketModule.verifyCallTicket(signed, signingSecret);
  assert.equal(payload.sub, "user_operator");
  assert.equal(payload.to, "+442079460123");
  assert.equal(payload.from, secondaryCaller);
  const [encoded, signature] = signed.split(".");
  const tampered = JSON.parse(Buffer.from(encoded, "base64url").toString());
  tampered.from = primaryCaller;
  const changed = Buffer.from(JSON.stringify(tampered)).toString("base64url");
  assert.equal(ticketModule.verifyCallTicket(`${changed}.${signature}`, signingSecret), null);
});

test("permits without a caller ID and expired permits are rejected", (context) => {
  const signed = ticketModule.signCallTicket("user_operator", "+442079460123", primaryCaller, signingSecret);
  const payload = ticketModule.verifyCallTicket(signed, signingSecret);
  const legacy = { ...payload };
  delete legacy.from;
  const encoded = Buffer.from(JSON.stringify(legacy)).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(encoded).digest("base64url");
  assert.equal(ticketModule.verifyCallTicket(`${encoded}.${signature}`, signingSecret), null);
  context.mock.method(Date, "now", () => (payload.exp + 1) * 1000);
  assert.equal(ticketModule.verifyCallTicket(signed, signingSecret), null);
});

const approvedCallers = [
  { number: primaryCaller, label: "Primary" },
  { number: secondaryCaller, label: "Uganda mobile" },
];
const voiceConfig = {
  accountSid: `AC${"c".repeat(32)}`, authToken: "test-auth-token", webhookUrl: "https://example.test/api/voice/twiml",
  fromNumber: primaryCaller, callerIds: approvedCallers, signingSecret,
};

function authorizeRoute({ userId = "user_operator", approved = true, callers = approvedCallers } = {}) {
  const route = loadModule("../src/app/api/voice/authorize/route.ts", {
    "@clerk/nextjs/server": { auth: async () => ({ userId }) },
    "@/lib/access": { operatorHasAccess: () => approved },
    "@/lib/call-ticket": ticketModule,
    "@/lib/caller-ids": callerIdsModule,
    "@/lib/billing-call-access": {requireRealCallingAccess:()=>{}}, "@/lib/billing-config": {BillingError:class extends Error{}},
    "@/lib/operator-caller-ids": {operatorCallerIds:async()=>callers},
    "@/lib/destination": { validateCallingDestination: (value) => value === "+442079460123" ? value : null },
    "@/lib/voice-config": { getVoiceConfig: () => voiceConfig },
    "@/lib/voice-responses": {
      voiceJson: (data, status = 200) => Response.json(data, { status }),
      isSameOrigin: (request) => request.headers.get("origin") === new URL(request.url).origin,
    },
  });
  return (body, origin = "https://example.test") => route.POST(new Request("https://example.test/api/voice/authorize", {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
  }));
}

test("authorization mints a permit for the selected caller and defaults older clients to primary", async () => {
  for (const from of [secondaryCaller, undefined]) {
    const response = await authorizeRoute()({ to: "+442079460123", from });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.callerId, from ?? primaryCaller);
    assert.equal(ticketModule.verifyCallTicket(body.ticket, signingSecret).from, from ?? primaryCaller);
  }
});

test("authorization refuses arbitrary and malformed caller IDs", async () => {
  for (const from of ["+442079460123", "", null, 123, { number: primaryCaller }]) {
    const response = await authorizeRoute()({ to: "+442079460123", from });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).ticket, undefined);
  }
});

test("multi-number authorization retains session, operator and origin checks", async () => {
  const body = { to: "+442079460123", from: secondaryCaller };
  assert.equal((await authorizeRoute({ userId: null })(body)).status, 401);
  assert.equal((await authorizeRoute({ approved: false })(body)).status, 403);
  assert.equal((await authorizeRoute()(body, "https://other.test")).status, 403);
});

test("call authorization refuses globally configured caller IDs outside the operator's assignment",async()=>{
  const response=await authorizeRoute({callers:[{number:secondaryCaller,label:"Owned"}]} )({to:"+442079460123",from:primaryCaller});
  assert.equal(response.status,403);
  assert.equal((await authorizeRoute({callers:[]})({to:"+442079460123"})).status,403);
});

function webhookRoute(config = voiceConfig, approved = true) {
  const route = loadModule("../src/app/api/voice/twiml/route.ts", {
    "@/lib/call-ticket": ticketModule,
    "@/lib/caller-ids": callerIdsModule,
    "@/lib/billing-call-access": {requireRealCallingAccess:()=>{}}, "@/lib/billing-config": {BillingError:class extends Error{}},
    "@/lib/operator-caller-ids": {operatorCallerIds:async()=>config.callerIds},
    "@/lib/access": {operatorHasAccess:()=>approved},
    "@/lib/destination": { validateCallingDestination: (value) => value === "+442079460123" ? value : null },
    "@/lib/voice-config": { getVoiceConfig: () => config },
    "@/lib/review-call-tracking": { trackCall:async () => false },
  });
  return (ticket, overrides = {}, validSignature = true) => {
    const params = { AccountSid: config.accountSid, From: "client:user_operator", Ticket: ticket, ...overrides };
    const signature = require("twilio").getExpectedTwilioSignature(config.authToken, config.webhookUrl, params);
    return route.POST(new Request(config.webhookUrl, {
      method: "POST", headers: { "X-Twilio-Signature": validSignature ? signature : "invalid" },
      body: new URLSearchParams(params),
    }));
  };
}

test("TwiML uses only the caller and recipient from the signed permit", async () => {
  const ticket = ticketModule.signCallTicket("user_operator", "+442079460123", secondaryCaller, signingSecret);
  const response = await webhookRoute()(ticket, { CallerId: primaryCaller, To: "+14165550123" });
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, new RegExp(`callerId="\\${secondaryCaller}"`));
  assert.ok(xml.includes("<Number>+442079460123</Number>"));
  assert.ok(!xml.includes(primaryCaller));
  assert.ok(!xml.includes("+14165550123"));
});

test("TwiML refuses a caller removed from the server allowlist after permit issuance", async () => {
  const ticket = ticketModule.signCallTicket("user_operator", "+442079460123", secondaryCaller, signingSecret);
  const response = await webhookRoute({ ...voiceConfig, callerIds: [approvedCallers[0]] })(ticket);
  assert.equal(response.status, 403);
});

test("TwiML retains Twilio signature, account and operator identity validation", async () => {
  const ticket = ticketModule.signCallTicket("user_operator", "+442079460123", primaryCaller, signingSecret);
  assert.equal((await webhookRoute()(ticket, {}, false)).status, 403);
  assert.equal((await webhookRoute()(ticket, { AccountSid: `AC${"d".repeat(32)}` })).status, 403);
  assert.equal((await webhookRoute()(ticket, { From: "client:user_other" })).status, 403);
  assert.equal((await webhookRoute(voiceConfig,false)(ticket)).status,403);
});
