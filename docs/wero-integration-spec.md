# Wero Integration Spec

**Status:** Research / Decision pending  
**Last updated:** July 2026  
**Scope:** Evaluate Wero as a payment method in WeShare and define integration paths

---

## What Is Wero

Wero is a pan-European digital wallet launched on 2 July 2024 by the European Payments Initiative (EPI). It replaced or absorbed several local payment schemes:

| Replaced scheme | Country |
|---|---|
| Giropay | Germany |
| Paylib | France |
| Payconiq | Belgium / Luxembourg |
| iDEAL | Netherlands (rollout) |

It runs on SEPA Instant Credit Transfer (SCT Inst) rails — meaning payments settle in seconds, 24/7, including weekends and bank holidays. As of mid-2026 it has approximately 43 million enrolled users across its launch markets.

Wero has two distinct modes that are relevant to WeShare:

- **P2P (peer-to-peer):** Users send and request money from other Wero users using a phone number or email address. Available since launch.
- **Merchant checkout (C2B):** Merchants accept Wero at checkout via a PSP redirect. Live in Germany since November 2025; rolling out to France, Belgium, and the Netherlands through 2026.

---

## Relevance to WeShare

WeShare is a bill-split app. The primary user action Wero would serve is **settling a debt between two people**. That maps to two different product questions:

1. Can a WeShare user who owes money pay the person they owe — inside the app — using Wero?
2. Can WeShare act as a merchant and collect payment from a user?

For a consumer split app, option 1 (P2P-flavoured settlement flow) is the more natural fit. Option 2 (merchant checkout) would only make sense if WeShare holds funds on behalf of groups, which it currently does not.

Both paths are documented below.

---

## Country and Bank Coverage

### Live as of July 2026

**Germany**
- Sparkasse, Postbank, VR Banks (since 2024 launch)
- Deutsche Bank, ING, Revolut (joined 2025)
- N26 (announced Dec 2025, rollout H2 2026)
- Commerzbank (announced Feb 2026)

**France**
- BNP Paribas, Crédit Agricole, Crédit Mutuel, Monabanq, Société Générale
- Majority of major retail banks live by end of 2024

**Belgium**
- KBC, Belfius, BNP Paribas Fortis, ING Belgium
- Argenta, Bank van Breda, Beobank, Crelan, vdk bank (joined July 2025)

### Planned
- Netherlands and Luxembourg: merchant checkout from Q4 2026
- Long-term target: 15 EU countries

---

## Integration Options

There are four realistic approaches for WeShare. They are ordered from highest to lowest fit.

---

### Option 1 — Extend the Existing Stripe Integration

**Effort:** Low–Medium  
**Fit:** High for merchant checkout; moderate for settlement

Stripe added Wero support in Germany in November 2025. France, Belgium, and the Netherlands are planned for 2026. WeShare already has a Stripe integration (Supabase Edge Functions + StripePaymentCard component), so this requires the least new infrastructure.

**How the flow works:**

1. WeShare backend creates a Stripe PaymentIntent with `payment_method_types: ["wero"]`
2. Stripe returns a `next_action.redirect_to_url` value
3. The mobile app opens that URL — on a device with Wero installed it deep-links into the Wero app or the user's banking app; on a desktop browser it shows a QR code
4. The user confirms the payment in Wero
5. Wero redirects back to a `return_url`; a Stripe webhook (`payment_intent.succeeded`) confirms settlement on the server

**Stripe React Native SDK:**

The `@stripe/stripe-react-native` SDK's `presentPaymentSheet` method handles the redirect and the return deep link automatically. The existing `StripePaymentCard` component would need a Wero-specific branch, but the plumbing (PaymentIntent creation, webhook handler) is already in place.

**Limitations:**

- Only available in Germany today; France and Belgium follow in 2026
- Requires WeShare to act as the merchant collecting funds — means funds flow through WeShare/Stripe, not directly between users
- Does not cover P2P settlement where users send money to each other outside WeShare

**PSP fees:**

Stripe's pricing for Wero has not been publicly confirmed at time of writing, but Wero is generally positioned as cheaper than card payments because it bypasses interchange and card-scheme fees. Expect a fixed-plus-variable model similar to SEPA Direct Debit.

---

### Option 2 — P2P Deep Link (No Backend Required)

**Effort:** Low  
**Fit:** High for settlement UX; no payment confirmation back to the app

This approach treats Wero the same way WeShare currently treats bank transfer suggestions: the app surfaces the recipient's Wero-linked phone number and offers a button that opens the Wero app via deep link with a pre-filled payment request.

**How the flow works:**

1. The paying user taps "Pay with Wero" on the settle screen
2. If the recipient's WeShare profile has a phone number, WeShare constructs a Wero deep link:

        wero://pay?phone=+33612345678&amount=24.50&currency=EUR&label=WeShare%20-%20Weekend%20Crew

3. The system opens the Wero app (or the banking app supporting Wero)
4. The user confirms the transfer inside Wero
5. The user returns to WeShare manually and marks the debt as settled

**What WeShare stores:** Only the recipient's phone number, already collected during member invite. No additional data needed.

**What WeShare does NOT get:** A server-side payment confirmation. The app cannot automatically mark debts as paid — the user must tap "Mark as settled" themselves, same as the current bank-transfer flow.

**Deep link scheme:**

The official Wero deep link scheme has not been publicly documented by EPI at time of writing. The `wero://` scheme is used in practice but should be verified against EPI developer materials before shipping. A fallback is to open `https://pay.wero.eu/?phone=…` in the browser, which triggers the app or shows a QR code.

**Limitations:**

- No settlement confirmation — relies on user self-reporting
- Recipient must have Wero enrolled and linked to that phone number
- Deep link scheme is unofficial / unconfirmed
- No refund or dispute mechanism within WeShare

---

### Option 3 — Via Mollie

**Effort:** Medium (new PSP, new Edge Functions)  
**Fit:** Good if Stripe's Wero rollout is too slow

Mollie supports Wero in Germany, France, and Belgium today. The integration model is a redirect-based checkout similar to Stripe's but with Mollie-specific APIs.

**How the flow works:**

1. WeShare backend calls the Mollie Payments API to create a payment with `method: "wero"`
2. Mollie returns a `checkoutUrl`
3. The app opens the URL; Mollie handles the Wero redirect / app switch
4. Mollie calls WeShare's webhook on completion

**Mollie React Native note:**

Mollie's documentation explicitly supports mobile app integrations using a custom URL scheme as the `redirectUrl`. The app opens the checkout URL in the device's default browser (not a WebView) to ensure the Wero app switch works correctly.

**Why to consider this:**

- Wider current country coverage than Stripe's Wero rollout
- Mollie has established support in France and Belgium right now
- Downside: adds a second payment processor, duplicates Edge Function logic

---

### Option 4 — Other PSPs (Worldline, PAYONE, Nuvei, etc.)

**Effort:** High  
**Fit:** Low for WeShare's scale

Worldline, PAYONE, Computop, Nuvei, Axepta BNP Paribas, Unzer, and PPRO all support Wero. These are enterprise-grade PSPs typically aimed at large merchants, require signed contracts, and come with higher minimum volumes and more complex onboarding.

Not recommended for WeShare at this stage.

---

### Option 5 — Direct EPI API

**Effort:** Not available  
**Fit:** N/A

Access to EPI's direct API is restricted to banks and licensed PSPs. Third-party consumer apps cannot integrate directly. All external Wero integrations go through a PSP.

---

## Payment Flows Compared

| | Option 1 (Stripe) | Option 2 (P2P deep link) | Option 3 (Mollie) |
|---|---|---|---|
| Server confirmation | Yes (webhook) | No | Yes (webhook) |
| Auto-marks debt settled | Yes | No | Yes |
| Countries live now | Germany | DE / FR / BE (Wero P2P) | DE / FR / BE |
| New backend work | Minimal (extends Stripe) | None | New Edge Functions |
| User needs Wero app | Yes | Yes | Yes |
| WeShare holds funds | Yes | No | Yes |
| Refund / dispute support | Via Stripe | None | Via Mollie |

---

## Fees and Settlement

- **Settlement speed:** Seconds, 24/7, instant and final on the SEPA Instant rail
- **Dispute window:** 24–72 hours (shorter than card chargebacks but not zero)
- **Merchant fees:** Not publicly fixed by EPI — each PSP sets its own pricing. Expected to be lower than card interchange. Stripe and Mollie publish their fee schedules on their payment method pages
- **P2P (Option 2):** No fee to WeShare — the transfer happens entirely within the user's banking app

---

## Limitations and Risks

**Coverage gaps:** Even in Germany, not every bank supports Wero yet. N26 (popular with WeShare's demographic) only reaches its users from H2 2026. Users on unsupported banks cannot enrol.

**Merchant checkout is new:** The ecommerce product only launched in November 2025. Bugs, UX rough edges, and PSP rollout delays are likely in the near term.

**No P2P confirmation:** The deep-link approach (Option 2) cannot confirm that a payment was made. WeShare cannot auto-settle debts without the merchant checkout path.

**Deep link scheme unconfirmed:** EPI has not published an official mobile deep link URI spec. The `wero://` scheme used in the wild could change. This is low risk for now but should be monitored.

**Subscriptions / recurring:** Wero does not yet support recurring payments or pre-authorised mandates, so it cannot be used for subscription billing.

**Refunds:** Instant payments on SCT Inst are final. Refunds are possible via a reverse transfer, but the UX and liability model varies by PSP.

---

## Recommendation for WeShare

**Short term (now):**  
Ship Option 2 (P2P deep link) on the settle screen. It requires no backend work, covers all three launch markets for P2P Wero today, and matches the existing "suggest a bank transfer" UX pattern already in the app. The only trade-off is that settlement confirmation is manual — acceptable given it is the same trade-off users already accept with bank transfers.

**Medium term (Q3–Q4 2026):**  
Extend the Stripe integration (Option 1) to support Wero checkout as Stripe rolls out to France and Belgium. This adds server-side confirmation and auto-settlement, replacing the manual step. The backend plumbing — PaymentIntent, webhook, StripePaymentCard — is already there. The incremental work is adding `wero` to the allowed payment method types and a Wero-specific UI branch on the settle screen.

**If Stripe's rollout lags:**  
Evaluate Mollie (Option 3) as a parallel path for France and Belgium specifically. Only pursue this if there is a concrete user demand signal from those markets, since it adds a second PSP to maintain.

---

## Open Questions Before Shipping Option 2

- What is the confirmed `wero://` deep link URI scheme? (Verify against EPI or a bank's published documentation)
- Do WeShare member profiles reliably store the phone number in a Wero-compatible format (E.164)?
- Should WeShare display a "Does this person have Wero?" hint, or always show the button and let the OS handle the "app not installed" case?

---

## References

- [Wero — Wikipedia](https://en.wikipedia.org/wiki/Wero_(payment))
- [EPI Company official site](https://epicompany.eu/)
- [Wero wallet site](https://wero-wallet.eu/)
- [Stripe — Wero payments documentation](https://docs.stripe.com/payments/wero)
- [Stripe — Wero guide for businesses in France](https://stripe.com/resources/more/wero-guide-france)
- [Stripe — what businesses should know about Wero](https://stripe.com/resources/more/wero-how-europes-unified-digital-wallet-is-changing-payments)
- [Mollie — activate Wero payments](https://www.mollie.com/payments/wero)
- [Mollie — complete Wero guide for businesses](https://www.mollie.com/growth/wero-payment-guide)
- [Worldline — what is Wero and when can merchants start using it](https://worldline.com/en/home/main-navigation/resources/blogs/2025/what-is-wero-and-when-can-merchants-start-using-it)
- [Nuvei — Wero documentation](https://docs.nuvei.com/documentation/europe-guides/wero/)
- [Unzer — Wero documentation](https://docs.unzer.com/payment-methods/wero/)
- [PAYONE — Wero developer docs](https://developer.payone.com/en/payment-methods-and-features/payment-methods/wero)
- [Worldline direct — Wero integration](https://docs.direct.worldline-solutions.com/en/payment-methods-and-features/payment-methods/wero)
- [PPRO developer hub — Wero](https://developerhub.ppro.com/global-api/docs/wero)
- [Axepta BNP Paribas — REST API Wero](https://docs.axepta.bnpparibas/display/DOCBNP/REST+API+Wero)
- [Nomupay — Wero integration](https://docs.nomupay.com/payments/integration-up-api/payment-methods/wero/)
- [Computop — Wero (EPI) documentation](https://developer.computop.com/pages/viewpage.action?pageId=142115747)
- [Checkout.com — what is Wero and how does it work](https://www.checkout.com/blog/wero-payments)
- [Banking.Vision — Wero 2025/2026 development](https://banking.vision/en/development-wero-2025-2026/)
- [European Business Magazine — 43 million users in 12 months](https://europeanbusinessmagazine.com/business/43-million-users-in-12-months-how-wero-is-building-europes-answer-to-visa-and-mastercard/)
- [ACI Worldwide + EPI partnership](https://investor.aciworldwide.com/news-releases/news-release-details/aci-worldwide-and-epi-power-instant-payments-europe)
- [Nuvei + EPI launch announcement](https://www.nuvei.com/posts/nuvei-and-european-payments-initiative-launch-wero-payments-for-european-ecommerce-merchants)
- [MultiSafepay — Wero merchant guide](https://www.multisafepay.com/blog/wero-is-here-what-changes-for-your-business)
- [Primer — Wero payment method explained](https://www.primer.io/blog/wero-payment-method)
- [Factually — which banks support Wero](https://factually.co/fact-checks/finance/which-european-banks-and-apps-support-wero-availability-by-country-8b4ad7)
