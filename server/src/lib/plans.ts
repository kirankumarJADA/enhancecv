// Subscription plans and server-side usage quotas.
//
// - Plans are defined centrally; limits are configurable via environment
//   variables (PLAN_<PLAN>_<FEATURE>) for operations without code changes.
// - Enforcement happens server-side only, keyed on the authenticated user —
//   frontend state can never bypass it.
// - Usage is counted per calendar month (UTC) in usage_records.

import { getDb } from '../db/db';
import { AppError } from '../middleware/errors';

export type PlanId = 'FREE' | 'PRO' | 'PREMIUM';

export type QuotaFeature =
  | 'tailoring'
  | 'critique'
  | 'coverLetter'
  | 'linkedin'
  | 'jobSearch'
  | 'urlImport'
  | 'interviewPrep'
  | 'mockInterview'
  | 'companyResearch'
  | 'grammar'
  | 'translate';

export interface PlanLimits extends Record<QuotaFeature, number> {
  label: string;
  description: string;
}

function limit(plan: PlanId, feature: QuotaFeature, dflt: number): number {
  const raw = parseInt(process.env[`PLAN_${plan}_${feature.toUpperCase()}`] || '', 10);
  return Number.isNaN(raw) ? dflt : Math.max(0, raw);
}

const DEFAULT_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: {
    label: 'Free',
    description: 'Core resume tools with monthly AI allowances.',
    tailoring: 5,
    critique: 10,
    coverLetter: 2,
    linkedin: 2,
    jobSearch: 10,
    urlImport: 10,
    interviewPrep: 3,
    mockInterview: 5,
    companyResearch: 2,
    grammar: 10,
    translate: 2,
  },
  PRO: {
    label: 'Pro',
    description: 'For active job hunts — generous AI limits.',
    tailoring: 50,
    critique: 100,
    coverLetter: 25,
    linkedin: 25,
    jobSearch: 100,
    urlImport: 100,
    interviewPrep: 30,
    mockInterview: 50,
    companyResearch: 25,
    grammar: 100,
    translate: 20,
  },
  PREMIUM: {
    label: 'Premium',
    description: 'Unlimited-feeling limits for heavy users and career coaches.',
    tailoring: 500,
    critique: 1000,
    coverLetter: 250,
    linkedin: 250,
    jobSearch: 1000,
    urlImport: 1000,
    interviewPrep: 300,
    mockInterview: 500,
    companyResearch: 250,
    grammar: 1000,
    translate: 200,
  },
};

export function getPlanLimits(plan: PlanId): PlanLimits {
  const dflt = DEFAULT_LIMITS[plan];
  return {
    label: dflt.label,
    description: dflt.description,
    tailoring: limit(plan, 'tailoring', dflt.tailoring),
    critique: limit(plan, 'critique', dflt.critique),
    coverLetter: limit(plan, 'coverLetter', dflt.coverLetter),
    linkedin: limit(plan, 'linkedin', dflt.linkedin),
    jobSearch: limit(plan, 'jobSearch', dflt.jobSearch),
    urlImport: limit(plan, 'urlImport', dflt.urlImport),
    interviewPrep: limit(plan, 'interviewPrep', dflt.interviewPrep),
    mockInterview: limit(plan, 'mockInterview', dflt.mockInterview),
    companyResearch: limit(plan, 'companyResearch', dflt.companyResearch),
    grammar: limit(plan, 'grammar', dflt.grammar),
    translate: limit(plan, 'translate', dflt.translate),
  };
}

/** Public plan catalogue (no secrets). */
export function listPlans(): { id: PlanId; label: string; description: string; limits: Omit<PlanLimits, 'label' | 'description'> }[] {
  return (Object.keys(DEFAULT_LIMITS) as PlanId[]).map((id) => {
    const l = getPlanLimits(id);
    return {
      id,
      label: l.label,
      description: l.description,
      limits: {
        tailoring: l.tailoring,
        critique: l.critique,
        coverLetter: l.coverLetter,
        linkedin: l.linkedin,
        jobSearch: l.jobSearch,
        urlImport: l.urlImport,
        interviewPrep: l.interviewPrep,
        mockInterview: l.mockInterview,
        companyResearch: l.companyResearch,
        grammar: l.grammar,
        translate: l.translate,
      },
    };
  });
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
}

export interface UsageSnapshot {
  plan: PlanId;
  period: string;
  features: { feature: QuotaFeature; used: number; limit: number }[];
}

export async function getPlanForUser(userId: string): Promise<PlanId> {
  const res = await getDb().query('SELECT plan, status FROM subscriptions WHERE user_id = $1', [userId]);
  const row = res.rows[0] as { plan: string; status: string } | undefined;
  // Only paid states unlock paid plans; anything else falls back to FREE.
  if (row && (row.status === 'active' || row.status === 'trialing' || row.status === 'past_due')) {
    if (row.plan === 'PRO' || row.plan === 'PREMIUM') return row.plan;
  }
  return 'FREE';
}

export async function getUsage(userId: string): Promise<UsageSnapshot> {
  const plan = await getPlanForUser(userId);
  const period = currentPeriod();
  const limits = getPlanLimits(plan);
  const res = await getDb().query(
    'SELECT feature, COUNT(*)::int AS used FROM usage_records WHERE user_id = $1 AND period = $2 GROUP BY feature',
    [userId, period],
  );
  const usedBy = new Map<string, number>();
  for (const row of res.rows as { feature: string; used: number }[]) {
    usedBy.set(row.feature, row.used);
  }
  const quotaFeatures: QuotaFeature[] = [
    'tailoring', 'critique', 'coverLetter', 'linkedin', 'jobSearch', 'urlImport',
    'interviewPrep', 'mockInterview', 'companyResearch', 'grammar', 'translate',
  ];
  const features = quotaFeatures.map((feature) => ({
    feature,
    used: usedBy.get(feature) || 0,
    limit: limits[feature],
  }));
  return { plan, period, features };
}

/** Throw a clear 402 error when the monthly quota for a feature is exhausted. */
export async function enforceQuota(userId: string, feature: QuotaFeature): Promise<void> {
  const snapshot = await getUsage(userId);
  const entry = snapshot.features.find((f) => f.feature === feature)!;
  if (entry.used >= entry.limit) {
    throw new AppError(
      'QUOTA_EXCEEDED',
      `You have used all ${entry.limit} ${featureLabel(feature)} generations included in the ${snapshot.plan} plan this month. Upgrade your plan or wait for the next cycle.`,
      402,
    );
  }
}

/** Record one successful use of a feature (call after the operation succeeded). */
export async function recordUsage(userId: string, feature: QuotaFeature): Promise<void> {
  await getDb().query(
    'INSERT INTO usage_records (id, user_id, feature, period) VALUES ($1, $2, $3, $4)',
    [`usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`, userId, feature, currentPeriod()],
  );
}

function featureLabel(feature: QuotaFeature): string {
  switch (feature) {
    case 'tailoring': return 'AI tailoring';
    case 'critique': return 'AI critique';
    case 'coverLetter': return 'cover letter';
    case 'linkedin': return 'LinkedIn optimisation';
    case 'jobSearch': return 'job discovery searches';
    case 'urlImport': return 'job URL imports';
    case 'interviewPrep': return 'interview preparations';
    case 'mockInterview': return 'mock interviews';
    case 'companyResearch': return 'company research runs';
    case 'grammar': return 'grammar improvement runs';
    case 'translate': return 'translations';
  }
}
