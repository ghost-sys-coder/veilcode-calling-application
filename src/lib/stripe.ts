import "server-only";
import Stripe from "stripe";
import { getStripeConfig } from "@/lib/stripe-config";

// Lazy initialization keeps calling and builds independent of billing setup.
// Every future Checkout, Portal, and billing API must use this factory.
export function stripeService(): Stripe {
  const { apiKey } = getStripeConfig();
  return new Stripe(apiKey, {
    maxNetworkRetries: 2,
    timeout: 10_000,
    telemetry: false,
  });
}
