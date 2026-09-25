// Billing & subscriptions.
//
// Architecture:
// - Plans/limits live in lib/plans.ts. Subscription STATE lives in the
//   subscriptions table and is written ONLY by verified Stripe webhooks —
//   never from frontend input.
// - Stripe is called over HTTPS with form-encoded bodies (no SDK dependency).
// - If STRIPE_SECRET_KEY is absent the app boots normally: checkout/portal
//   return a clear BILLING_UNAVAILABLE error and every resume feature keeps
//   working on the FREE plan. Payments are never faked.
// - Webhook signatures are verified with HMAC-SHA256 (Stripe scheme) before
//   any state changes; events are idempotent via the billing_events table.

import { Router, Request, Response, raw } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb, newId } from '../db/db';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { rateLimit } from '../middleware/rateLimit';
import { listPlans, getPlanForUser } from '../lib/plans';
import { track } from '../lib/analytics';
import { captureError } from '../lib/monitoring';
import { config } from '../config';

const router = Router();

const STRIPE_API = 'https://api.stripe.com/v1';

function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function priceForPlan(planId: string): string | undefined {
  if (planId === 'PRO') return process.env.STRIPE_PRICE_PRO;
  if (planId === 'PREMIUM') return process.env.STRIPE_PRICE_PREMIUM;
  return undefined;
}

function planForPrice(priceId: string | undefined): 'PRO' | 'PREMIUM' | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'PRO';
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return 'PREMIUM';
  return null;
}

// Minimal shapes of the Stripe responses we consume.
interface StripeSession {
  id: string;
  url?: string;
  customer?: string;
  subscription?: string;
  client_reference_id?: string;
}
interface StripeSubscription {
  id: string;
  status: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  customer?: string;
  metadata?: Record<string, string>;
  items?: { data?: { price?: { id?: string } }[] };
}
interface StripeCustomer {
  id: string;
}

async function stripeRequest<T>(path: string, params: Record<string, string> = {}, method: 'POST' | 'GET' = 'POST'): Promise<T> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'POST' ? body : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text();
    captureError(new Error(`stripe ${path} status=${res.status}`), { code: 'STRIPE_API_ERROR', route: path });
    throw new AppError('STRIPE_ERROR', `Payment provider error (${res.status}).`, 502);
  }
  return (await res.json()) as T;
}

// --- public endpoints ---------------------------------------------------------

router.get('/plans', (_req, res) => {
  res.json({ plans: listPlans(), billingConfigured: stripeConfigured() });
});

router.get('/status', requireAuth, async (req, res) => {
  const db = getDb();
  const row = (await db.query('SELECT plan, status, current_period_end, cancel_at_period_end, stripe_customer_id FROM subscriptions WHERE user_id = $1', [req.user!.uid])).rows[0] as
    | { plan: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean; stripe_customer_id: string | null }
    | undefined;
  const effectivePlan = await getPlanForUser(req.user!.uid);
  res.json({
    billingConfigured: stripeConfigured(),
    plan: effectivePlan,
    subscription: row
      ? {
          plan: row.plan,
          status: row.status,
          currentPeriodEnd: row.current_period_end,
          cancelAtPeriodEnd: row.cancel_at_period_end,
          hasPaymentMethod: !!row.stripe_customer_id,
        }
      : null,
  });
});

router.post('/checkout', requireAuth, rateLimit({ windowMs: 60_000, max: 5 }), async (req, res) => {
  const body = z.object({ planId: z.enum(['PRO', 'PREMIUM']) }).parse(req.body);
  if (!stripeConfigured()) throw new AppError('BILLING_UNAVAILABLE', 'Online payments are not configured for this deployment. All resume tools keep working on the Free plan.', 503);
  const price = priceForPlan(body.planId);
  if (!price) throw new AppError('BILLING_UNCONFIGURED', `No Stripe price is configured for the ${body.planId} plan.`, 503);

  const db = getDb();
  let customerId = ((await db.query('SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1', [req.user!.uid])).rows[0] as { stripe_customer_id: string | null } | undefined)?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripeRequest<StripeCustomer>('/customers', {
      email: req.user!.email,
      'metadata[userId]': req.user!.uid,
    });
    customerId = customer.id;
  }

  const session = await stripeRequest<StripeSession>('/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    client_reference_id: req.user!.uid,
    'metadata[userId]': req.user!.uid,
    'metadata[planId]': body.planId,
    success_url: `${config.appUrl}/billing?checkout=success`,
    cancel_url: `${config.appUrl}/billing?checkout=canceled`,
  });
  res.json({ url: session.url || null });
});

router.post('/portal', requireAuth, rateLimit({ windowMs: 60_000, max: 5 }), async (req, res) => {
  if (!stripeConfigured()) throw new AppError('BILLING_UNAVAILABLE', 'Online payments are not configured for this deployment.', 503);
  const db = getDb();
  const customerId = ((await db.query('SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1', [req.user!.uid])).rows[0] as { stripe_customer_id: string | null } | undefined)?.stripe_customer_id;
  if (!customerId) throw new AppError('NOT_FOUND', 'No billing profile found yet — subscribe to a plan first.', 404);
  const session = await stripeRequest<{ url?: string }>('/billing_portal/sessions', {
    customer: customerId,
    return_url: `${config.appUrl}/billing`,
  });
  res.json({ url: session.url || null });
});

// --- webhook -------------------------------------------------------------------

/** Verify Stripe's HMAC signature over `${timestamp}.${payload}`. */
function verifyStripeSignature(rawBody: Buffer, header: string | undefined, secret: string): void {
  if (!header) throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Missing webhook signature.', 400);
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Malformed webhook signature.', 400);
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (Number.isNaN(age) || age > 300) throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Webhook timestamp outside tolerance.', 400);
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed.', 400);
  }
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

async function upsertSubscription(userId: string, fields: { plan?: string; status?: string; stripeCustomerId?: string; stripeSubscriptionId?: string; currentPeriodEnd?: Date | null; cancelAtPeriodEnd?: boolean }): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO subscriptions (id, user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       plan = COALESCE($3, subscriptions.plan),
       status = COALESCE($4, subscriptions.status),
       stripe_customer_id = COALESCE($5, subscriptions.stripe_customer_id),
       stripe_subscription_id = COALESCE($6, subscriptions.stripe_subscription_id),
       current_period_end = COALESCE($7, subscriptions.current_period_end),
       cancel_at_period_end = COALESCE($8, subscriptions.cancel_at_period_end),
       updated_at = NOW()`,
    [newId('sub'), userId, fields.plan ?? null, fields.status ?? null, fields.stripeCustomerId ?? null, fields.stripeSubscriptionId ?? null, fields.currentPeriodEnd ?? null, fields.cancelAtPeriodEnd ?? false],
  );
}

router.post('/webhook', raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError('BILLING_UNAVAILABLE', 'Stripe webhooks are not configured for this deployment.', 503);
  }
  verifyStripeSignature(req.body as Buffer, req.header('Stripe-Signature'), secret);

  // The raw parser delivers a Buffer; parse the event JSON from it.
  let event: StripeEvent;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Webhook body was not valid JSON.', 400);
  }
  const db = getDb();

  // Idempotency: skip already-processed events.
  const seen = await db.query('SELECT id FROM billing_events WHERE stripe_event_id = $1', [event.id]);
  if (seen.rows.length > 0) {
    res.json({ received: true, duplicate: true });
    return;
  }
  await db.query('INSERT INTO billing_events (id, stripe_event_id, type, payload) VALUES ($1, $2, $3, $4)', [
    newId('bev'),
    event.id,
    event.type,
    // Payload metadata only — never card data or PII beyond ids/plan.
    JSON.stringify({ type: event.type, objectId: (event.data?.object as { id?: string })?.id || '' }),
  ]);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { client_reference_id?: string; customer?: string; subscription?: string; metadata?: Record<string, string> };
      const userId = session.client_reference_id || session.metadata?.userId;
      if (userId) {
        const planId = session.metadata?.planId === 'PREMIUM' ? 'PREMIUM' : 'PRO';
        await upsertSubscription(userId, {
          plan: planId,
          status: 'active',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
        });
        track(userId, 'subscription_started', { plan: planId });
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as unknown as StripeSubscription;
      const userId = sub.metadata?.userId;
      const lookupUserId = userId
        ? userId
        : ((await db.query('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1', [sub.id])).rows[0] as { user_id: string } | undefined)?.user_id;
      if (lookupUserId) {
        const plan = planForPrice(sub.items?.data?.[0]?.price?.id);
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
        await upsertSubscription(lookupUserId, {
          plan: plan || undefined,
          status,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: sub.customer,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        if (status === 'canceled') track(lookupUserId, 'subscription_canceled', {});
      }
    }
  } catch (err) {
    captureError(err, { code: 'WEBHOOK_PROCESSING_FAILED', route: '/api/billing/webhook' });
    res.status(500).json({ error: { code: 'WEBHOOK_FAILED', message: 'Webhook processing failed.' } });
    return;
  }

  res.json({ received: true });
});

export default router;
