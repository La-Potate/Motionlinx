'use strict';

const express = require('express');
const logger = require('../utils/logger');
const { dbGet, dbRun } = require('../utils/dbAsync');
const { normalizeUserLevel, DEFAULT_USER_LEVEL } = require('../utils/userLevel');
const { stripe, isStripeEnabled } = require('../integrations/stripe');
const authenticate = require('../middleware/authenticate');
const stripeIpAllowlist = require('../middleware/stripeIpAllowlist');
const { getPlanForRole, CREDIT_TOPUP, PLAN_CONFIG } = require('../services/credits');
const {
  ensureStripeConfigured,
  getStripePriceId,
  ensureStripeCustomer,
  handleSubscriptionSync,
  handleCheckoutCompleted,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
  STRIPE_WEBHOOK_SECRET,
} = require('../services/billing');

const router = express.Router();

function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  const host = req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

router.get('/plans', authenticate, async (req, res) => {
  res.json({
    plans: PLAN_CONFIG,
    topup: CREDIT_TOPUP,
    stripeConfigured: isStripeEnabled(),
  });
});

router.post('/checkout', authenticate, async (req, res) => {
  try {
    ensureStripeConfigured();
    const billingUser = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const { mode = 'subscription', plan = DEFAULT_USER_LEVEL, seats = 1 } = req.body || {};
    const normalizedPlan = normalizeUserLevel(plan);
    const planConfig = mode === 'topup' ? CREDIT_TOPUP : getPlanForRole(normalizedPlan);
    const priceId = mode === 'topup' ? getStripePriceId('topup') : getStripePriceId(normalizedPlan);
    if (!planConfig || !priceId) {
      return res.status(400).json({
        error: 'Invalid plan or missing Stripe price configuration',
      });
    }

    const quantity = mode === 'topup' ? 1 : Math.max(parseInt(seats, 10) || 1, 1);
    const baseUrl = getBaseUrl(req);
    const successUrl = STRIPE_SUCCESS_URL || `${baseUrl}/pricing?status=success`;
    const cancelUrl = STRIPE_CANCEL_URL || `${baseUrl}/pricing?status=cancel`;
    const customerId = await ensureStripeCustomer(billingUser);
    const session = await stripe.checkout.sessions.create({
      mode: mode === 'topup' ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity }],
      customer: customerId,
      customer_email: billingUser?.email || '',
      metadata: {
        userId: req.user.id,
        plan: normalizedPlan,
        seats: quantity,
        type: mode,
      },
      subscription_data:
        mode === 'topup'
          ? undefined
          : { metadata: { userId: req.user.id, plan: normalizedPlan, seats: quantity } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, 'Stripe checkout error');
    res.status(err.status || 500).json({ error: err.message || 'Unable to start checkout' });
  }
});

router.post('/webhook', stripeIpAllowlist, async (req, res) => {
  try {
    ensureStripeConfigured();
    if (!STRIPE_WEBHOOK_SECRET) {
      // In dev or when the secret isn't set, accept without verification.
      // Production env validation rejects this at boot time.
      return res.status(200).json({ received: true });
    }
    const signature = req.headers['stripe-signature'];
    const body = req.rawBody || JSON.stringify(req.body);
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.error({ err: err.message }, 'Stripe webhook verification failed');
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Stripe retries on any non-2xx and may deliver an event more than once
    // regardless. The top-up path is additive, so without this every
    // redelivery of one checkout.session.completed granted another 1000
    // credits. Claim the event id first; a second delivery finds the row and
    // is acknowledged without being processed again.
    const claim = await dbRun(
      'INSERT OR IGNORE INTO stripe_webhook_events (event_id, type) VALUES (?, ?)',
      [event.id, event.type],
    );
    if (!claim.changes) {
      logger.info({ eventId: event.id, type: event.type }, 'Stripe event already processed');
      return res.json({ received: true, duplicate: true });
    }

    try {
      await dispatchStripeEvent(event);
    } catch (err) {
      // Release the claim so Stripe's retry can reprocess it — a failure here
      // must not permanently swallow the event.
      await dbRun('DELETE FROM stripe_webhook_events WHERE event_id = ?', [event.id]).catch(
        () => undefined,
      );
      throw err;
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, 'Stripe webhook handler error');
    res.status(err.status || 500).json({ error: 'Webhook processing failed' });
  }
});

async function dispatchStripeEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await handleSubscriptionSync({
        subscriptionId: event.data.object.subscription,
        planId: event.data.object.metadata?.plan,
        seats: event.data.object.metadata?.seats,
        status: event.data.object.status,
        customerId: event.data.object.customer,
      });
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      await handleSubscriptionSync({
        subscriptionId: event.data.object.id,
        planId: event.data.object.metadata?.plan,
        seats: event.data.object.items?.data?.[0]?.quantity,
        status: event.data.object.status,
        customerId: event.data.object.customer,
      });
      break;
    default:
      break;
  }
}

module.exports = router;
