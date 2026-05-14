import Stripe from "stripe";

const globalForStripe = globalThis as typeof globalThis & { _stripe?: Stripe };

export const stripe: Stripe =
  globalForStripe._stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2026-04-22.dahlia"
  });

if (process.env.NODE_ENV !== "production") {
  globalForStripe._stripe = stripe;
}
