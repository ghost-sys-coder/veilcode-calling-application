import "server-only";

export type StripeMode = "test" | "live";

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

export function getStripeMode(): StripeMode {
  // A pulled .env.local can contain production Vercel flags. Require an actual
  // deployment ID as well; NODE_ENV=production alone also applies to previews.
  const productionDeployment = process.env.NODE_ENV === "production"
    && process.env.VERCEL === "1"
    && process.env.VERCEL_ENV === "production"
    && (!process.env.VERCEL_TARGET_ENV || process.env.VERCEL_TARGET_ENV === "production")
    && /^dpl_[A-Za-z0-9]+$/.test(process.env.VERCEL_DEPLOYMENT_ID ?? "");
  return productionDeployment ? "live" : "test";
}

export function getStripeConfig() {
  const mode = getStripeMode();
  const variable = mode === "live" ? "STRIPE_PROD_API_KEY" : "STRIPE_TEST_API_KEY";
  const apiKey = process.env[variable]?.trim();
  if (!apiKey) throw new StripeConfigurationError(`${variable} is required for Stripe ${mode} mode.`);
  // Accept restricted keys (preferred) and secret keys, never publishable keys.
  if (!new RegExp(`^(?:rk|sk)_${mode}_[A-Za-z0-9]+$`).test(apiKey)) {
    throw new StripeConfigurationError(`${variable} must be a ${mode}-mode restricted or secret API key.`);
  }
  return { mode, apiKey };
}
