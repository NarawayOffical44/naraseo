/**
 * Payment Route - Razorpay integration
 * POST /api/v1/payment/checkout - Create Razorpay order
 * POST /api/v1/payment/verify - Verify payment & upgrade tier
 */

import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';
import { sendApiError, sendApiResponse } from '../../middleware/apiKey.js';

const router = express.Router();

// Supabase client
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

// Initialize Razorpay (only if keys exist)
const rzp = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

// Pricing tiers
const PLANS = {
  pro: { name: 'Pro', credits: 1000, price: 4999, currency: 'INR' }, // ₹49.99/month
  agency: { name: 'Agency', credits: 999999, price: 49999, currency: 'INR' }, // ₹499.99/month
};

/**
 * POST /api/v1/payment/checkout
 * Create Razorpay order for plan upgrade
 * Body: { plan: 'pro' | 'agency' }
 */
router.post('/checkout', async (req, res) => {
  const { plan } = req.body;

  if (!plan || !PLANS[plan]) {
    return sendApiError(res, 'INVALID_PLAN', `Plan must be one of: ${Object.keys(PLANS).join(', ')}`, 400);
  }

  if (!req.user?.id) {
    return sendApiError(res, 'AUTH_REQUIRED', 'User must be authenticated', 401);
  }

  try {
    if (!rzp) {
      return sendApiError(res, 'PAYMENT_NOT_CONFIGURED', 'Razorpay not configured. Contact support.', 503);
    }

    const planConfig = PLANS[plan];
    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Create Razorpay order
    const order = await rzp.orders.create({
      amount: planConfig.price * 100, // Razorpay uses paise (1 INR = 100 paise)
      currency: planConfig.currency,
      receipt: orderId,
      notes: {
        userId: req.user.id,
        userEmail: req.user.email,
        plan: plan,
        tier: plan,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        order_id: order.id,
        amount: planConfig.price,
        currency: planConfig.currency,
        plan: plan,
        planName: planConfig.name,
        credits: planConfig.credits,
        key_id: process.env.RAZORPAY_KEY_ID,
        user_email: req.user.email,
        user_id: req.user.id,
      },
      meta: {
        message: 'Razorpay order created. Use order_id for payment on frontend.',
      },
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    return sendApiError(res, 'CHECKOUT_FAILED', error.message, 500);
  }
});

/**
 * POST /api/v1/payment/verify
 * Verify Razorpay payment signature & upgrade user tier
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan }
 */
router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return sendApiError(res, 'MISSING_FIELDS', 'razorpay_order_id, razorpay_payment_id, razorpay_signature required', 400);
  }

  if (!plan || !PLANS[plan]) {
    return sendApiError(res, 'INVALID_PLAN', `Plan must be one of: ${Object.keys(PLANS).join(', ')}`, 400);
  }

  if (!req.user?.id) {
    return sendApiError(res, 'AUTH_REQUIRED', 'User must be authenticated', 401);
  }

  try {
    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return sendApiError(res, 'INVALID_SIGNATURE', 'Payment signature verification failed', 403);
    }

    // Signature valid — update user tier in Supabase
    if (!supabase) {
      return sendApiError(res, 'DB_ERROR', 'Database not configured', 500);
    }

    const planConfig = PLANS[plan];
    const currentMonth = new Date().toISOString().slice(0, 7);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        plan: plan,
        credits: planConfig.credits,
        reset_month: currentMonth,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.user.id);

    if (updateError) {
      console.error('Profile update failed:', updateError);
      return sendApiError(res, 'UPDATE_FAILED', 'Could not update profile', 500);
    }

    // Log payment (optional but recommended for auditing)
    const { error: logError } = await supabase
      .from('payment_history')
      .insert([
        {
          user_id: req.user.id,
          razorpay_order_id,
          razorpay_payment_id,
          plan,
          amount: planConfig.price,
          currency: planConfig.currency,
          status: 'paid',
          created_at: new Date().toISOString(),
        },
      ]);

    if (logError) {
      console.warn('Payment logging failed (non-critical):', logError);
    }

    return res.status(200).json({
      success: true,
      data: {
        message: `Upgraded to ${planConfig.name}!`,
        plan: plan,
        credits: planConfig.credits,
        tier: plan,
      },
    });
  } catch (error) {
    console.error('Payment verification failed:', error);
    return sendApiError(res, 'VERIFICATION_FAILED', error.message, 500);
  }
});

/**
 * GET /api/v1/payment/status
 * Check current user's plan & credits
 */
router.get('/status', async (req, res) => {
  if (!req.user?.id) {
    return sendApiError(res, 'AUTH_REQUIRED', 'User must be authenticated', 401);
  }

  try {
    if (!supabase) {
      return sendApiError(res, 'DB_ERROR', 'Database not configured', 500);
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('plan, credits, reset_month')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      return sendApiError(res, 'PROFILE_NOT_FOUND', 'User profile not found', 404);
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const planConfig = PLANS[profile.plan] || PLANS.pro;

    return res.status(200).json({
      success: true,
      data: {
        plan: profile.plan || 'free',
        credits: profile.credits ?? 10,
        creditsLimit: planConfig.credits,
        monthlyResetDate: currentMonth,
        availablePlans: PLANS,
      },
    });
  } catch (error) {
    console.error('Status check failed:', error);
    return sendApiError(res, 'STATUS_FAILED', error.message, 500);
  }
});

export default router;
