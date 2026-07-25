'use strict';

const logger = require('../utils/logger');
const { dbGet, dbRun } = require('../utils/dbAsync');
const { normalizeUserLevel, DEFAULT_USER_LEVEL } = require('../utils/userLevel');
const {
  stripe,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_MAP,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
  isStripeEnabled,
} = require('../integrations/stripe');
const {
  PLAN_CONFIG,
  CREDIT_TOPUP,
  getPlanForRole,
  applyCreditChange,
  setCreditsToPlanLimit,
} = require('./credits');

function ensureStripeConfigured() {
  if (!isStripeEnabled()) {
    const err = new Error('Stripe is not configured');
    err.status = 503;
    throw err;
  }
}

function getStripePriceId(planId) {
  return STRIPE_PRICE_MAP[planId] || '';
}

async function ensureStripeCustomer(user) {
  let customerId = user?.stripe_customer_id;
  if (customerId) return customerId;
  const email = user?.email || '';
  const customer = await stripe.customers.create({
    email,
    metadata: { userId: user?.id || '' },
  });
  customerId = customer.id;
  await dbRun('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, user.id]);
  return customerId;
}

async function handleSubscriptionSync({ subscriptionId, planId, seats = 1, status, customerId }) {
  if (!subscriptionId) return;
  const dbUser =
    (await dbGet('SELECT * FROM users WHERE stripe_subscription_id = ?', [subscriptionId])) ||
    (customerId
      ? await dbGet('SELECT * FROM users WHERE stripe_customer_id = ?', [customerId])
      : null);
  if (!dbUser) return;
  const subDetails = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items'] });
  const derivedPlan = planId || subDetails?.metadata?.plan || dbUser.role;
  const normalizedPlan = normalizeUserLevel(derivedPlan);
  const plan = getPlanForRole(normalizedPlan);
  const periodEnd = subDetails?.current_period_end
    ? new Date(subDetails.current_period_end * 1000).toISOString()
    : null;
  const quantity =
    parseInt(seats, 10) || subDetails?.items?.data?.[0]?.quantity || dbUser.seat_count || 1;
  await dbRun(
    `UPDATE users SET role = ?, seat_count = ?, stripe_subscription_id = ?,
       stripe_customer_id = COALESCE(stripe_customer_id, ?),
       subscription_status = ?, subscription_current_period_end = ?
     WHERE id = ?`,
    [
      normalizedPlan,
      quantity,
      subscriptionId,
      customerId || dbUser.stripe_customer_id || null,
      status || subDetails?.status || dbUser.subscription_status || 'active',
      periodEnd,
      dbUser.id,
    ],
  );
  if (plan) {
    await setCreditsToPlanLimit(dbUser.id, normalizedPlan, 'subscription_payment', {
      seats: quantity,
      subscriptionId,
    });
  }
}

async function handleCheckoutCompleted(session) {
  const userId = parseInt(session?.metadata?.userId, 10);
  if (!userId) return;
  const type = session?.metadata?.type || (session.mode === 'payment' ? 'topup' : 'subscription');
  const seats = parseInt(session?.metadata?.seats, 10) || 1;
  const planId = normalizeUserLevel(session?.metadata?.plan || DEFAULT_USER_LEVEL);
  const subscriptionId = session.subscription || null;
  const customerId = session.customer || null;

  if (type === 'topup') {
    await applyCreditChange(
      userId,
      CREDIT_TOPUP.credits,
      'credit_topup',
      { checkoutSessionId: session.id, paymentIntent: session.payment_intent },
      true,
    );
    return;
  }

  const plan = getPlanForRole(planId);
  await dbRun(
    `UPDATE users
     SET role = ?, seat_count = ?, stripe_customer_id = COALESCE(stripe_customer_id, ?),
         stripe_subscription_id = ?, subscription_status = ?, subscription_current_period_end = ?
     WHERE id = ?`,
    [
      plan ? plan.id : planId,
      seats,
      customerId,
      subscriptionId,
      session.status || 'active',
      null,
      userId,
    ],
  );
  if (plan) {
    await setCreditsToPlanLimit(userId, plan.id, 'subscription_payment', {
      seats,
      subscriptionId,
      checkoutSessionId: session.id,
    });
  }
}

module.exports = {
  ensureStripeConfigured,
  getStripePriceId,
  ensureStripeCustomer,
  handleSubscriptionSync,
  handleCheckoutCompleted,
  PLAN_CONFIG,
  CREDIT_TOPUP,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
  STRIPE_WEBHOOK_SECRET,
};
