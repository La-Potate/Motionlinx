'use strict';

const Stripe = require('stripe');
const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PERSONAL,
  STRIPE_PRICE_BUSINESS,
  STRIPE_PRICE_AGENCY,
  STRIPE_PRICE_TOPUP,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
} = require('../config/env');

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const STRIPE_PRICE_MAP = {
  personal: STRIPE_PRICE_PERSONAL,
  business: STRIPE_PRICE_BUSINESS,
  agency: STRIPE_PRICE_AGENCY,
  topup: STRIPE_PRICE_TOPUP,
};

function isStripeEnabled() {
  return Boolean(stripe);
}

module.exports = {
  stripe,
  isStripeEnabled,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_MAP,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
};
