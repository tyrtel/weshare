#!/usr/bin/env bash
# Forward Stripe test events to the local Supabase Edge Function.
#
# Prerequisites:
#   - Stripe CLI installed: https://stripe.com/docs/stripe-cli
#   - Logged in: stripe login
#   - Supabase running locally: supabase start
#
# Usage:
#   bash scripts/stripe-listen.sh
#
# On start, the CLI prints a webhook signing secret:
#   > Ready! Your webhook signing secret is whsec_... (^C to quit)
#
# Copy that value and set it as a Supabase Edge Function secret:
#   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
#
# Then redeploy the webhook function to pick up the new secret:
#   supabase functions deploy stripe-webhook

set -euo pipefail

LOCAL_WEBHOOK_URL="http://localhost:54321/functions/v1/stripe-webhook"

echo "Forwarding Stripe test events → ${LOCAL_WEBHOOK_URL}"
echo ""
echo "When the signing secret appears below, run:"
echo "  supabase secrets set STRIPE_WEBHOOK_SECRET=<secret>"
echo "  supabase functions deploy stripe-webhook"
echo ""

stripe listen \
  --forward-to "${LOCAL_WEBHOOK_URL}" \
  --events checkout.session.completed,checkout.session.expired,payment_intent.payment_failed
