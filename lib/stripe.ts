import Stripe from "stripe";

const globalForStripe = globalThis as typeof globalThis & { _stripe?: Stripe };

export function getStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const stripe =
    globalForStripe._stripe ??
    new Stripe(apiKey, {
      apiVersion: "2026-04-22.dahlia"
    });

  if (process.env.NODE_ENV !== "production") {
    globalForStripe._stripe = stripe;
  }

  return stripe;
}
