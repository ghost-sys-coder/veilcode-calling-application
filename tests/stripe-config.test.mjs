import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./support/load-typescript.mjs";

const config = loadModule("../src/lib/stripe-config.ts", { "server-only": {} });
const variables = ["NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_TARGET_ENV", "VERCEL_DEPLOYMENT_ID",
  "STRIPE_PROD_API_KEY", "STRIPE_TEST_API_KEY"];
const production = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production", VERCEL_DEPLOYMENT_ID: "dpl_fixture" };
// Generated fixture keys are never sent to Stripe.
const key = (mode, type = "rk") => `${type}_${mode}_${"fixture".repeat(5)}`;

function environment(values, run) {
  const previous = Object.fromEntries(variables.map(name => [name, process.env[name]]));
  try {
    for (const name of variables) delete process.env[name];
    Object.assign(process.env, values);
    return run();
  } finally {
    for (const name of variables) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("Stripe uses the live key only on an actual Vercel production deployment", () => {
  environment({ ...production, STRIPE_PROD_API_KEY: key("live"), STRIPE_TEST_API_KEY: key("test") }, () => {
    assert.deepEqual(config.getStripeConfig(), { mode: "live", apiKey: key("live") });
  });
  environment({ ...production, VERCEL_TARGET_ENV: "", STRIPE_PROD_API_KEY: key("live") }, () => {
    assert.equal(config.getStripeMode(), "live");
  });
});

test("local, CI, preview and custom environments cannot select the live key", () => {
  const cases = [{}, { NODE_ENV: "production" }, { ...production, VERCEL: "" },
    { ...production, NODE_ENV: "test" }, { ...production, NODE_ENV: "development" },
    { ...production, VERCEL_ENV: "preview" }, { ...production, VERCEL_ENV: "development" },
    { ...production, VERCEL_ENV: "" }, { ...production, VERCEL_TARGET_ENV: "staging" },
    { ...production, VERCEL_DEPLOYMENT_ID: "" }, { ...production, VERCEL_DEPLOYMENT_ID: "invalid" }];
  for (const value of cases) environment({ ...value, STRIPE_TEST_API_KEY: key("test"), STRIPE_PROD_API_KEY: key("live") }, () => {
    assert.deepEqual(config.getStripeConfig(), { mode: "test", apiKey: key("test") });
  });
});

test("Stripe fails closed rather than falling back to the other environment's key", () => {
  for (const [value, variable] of [[{ ...production, STRIPE_TEST_API_KEY: key("test") }, "STRIPE_PROD_API_KEY"],
    [{ STRIPE_PROD_API_KEY: key("live") }, "STRIPE_TEST_API_KEY"]]) {
    environment(value, () => assert.throws(config.getStripeConfig, error =>
      error instanceof config.StripeConfigurationError && error.message.includes(variable)));
  }
});

test("Stripe rejects swapped, public and malformed keys without exposing their values", () => {
  for (const mode of ["test", "live"]) {
    const variable = mode === "live" ? "STRIPE_PROD_API_KEY" : "STRIPE_TEST_API_KEY";
    const deployment = mode === "live" ? production : {};
    for (const invalid of [key(mode === "test" ? "live" : "test"), key(mode, "pk"), "invalid-private-value", key(mode) + "\nextra", `rk_${mode}_`]) {
      environment({ ...deployment, [variable]: invalid }, () => assert.throws(config.getStripeConfig, error => {
        assert.ok(error instanceof config.StripeConfigurationError);
        assert.ok(!error.message.includes(invalid));
        return true;
      }));
    }
  }
});

test("Stripe accepts restricted or secret keys and trims accidental surrounding whitespace", () => {
  for (const type of ["rk", "sk"]) environment({ STRIPE_TEST_API_KEY: `  ${key("test", type)}\r\n` }, () => {
    assert.equal(config.getStripeConfig().apiKey, key("test", type));
  });
});

test("the Stripe factory initializes lazily with the selected key and bounded requests", () => {
  const initialized = [];
  class StripeFixture { constructor(apiKey, options) { initialized.push({ apiKey, options }); } }
  const { stripeService } = loadModule("../src/lib/stripe.ts", {
    "server-only": {}, stripe: StripeFixture, "@/lib/stripe-config": config,
  });
  assert.equal(initialized.length, 0);
  for (const [value, mode] of [[{}, "test"], [production, "live"]]) {
    environment({ ...value, STRIPE_TEST_API_KEY: key("test"), STRIPE_PROD_API_KEY: key("live") }, () => {
      assert.ok(stripeService() instanceof StripeFixture);
      assert.deepEqual(initialized.at(-1), { apiKey: key(mode), options: { maxNetworkRetries: 2, timeout: 10_000, telemetry: false } });
    });
  }
  environment({}, () => assert.throws(stripeService, config.StripeConfigurationError));
  assert.equal(initialized.length, 2);
});
