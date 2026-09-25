// Privacy-conscious first-party product analytics.
//
// Events carry user id, event name, timestamp and small non-sensitive
// metadata only. Never store passwords, keys, resume contents, job
// descriptions or AI prompts. Tracking failures must never break a request.

import { getDb } from '../db/db';

export type AnalyticsEvent =
  | 'signup'
  | 'login'
  | 'onboarding_completed'
  | 'master_cv_created'
  | 'master_cv_updated'
  | 'job_created'
  | 'job_analyzed'
  | 'resume_tailored'
  | 'ai_tailoring_completed'
  | 'ai_tailoring_failed'
  | 'resume_downloaded'
  | 'cover_letter_generated'
  | 'linkedin_generated'
  | 'template_selected'
  | 'application_created'
  | 'application_status_changed'
  | 'subscription_started'
  | 'subscription_canceled'
  | 'email_verified'
  | 'password_reset_completed'
  | 'job_search_completed'
  | 'job_url_imported'
  | 'job_saved'
  | 'job_dismissed'
  | 'interview_prep_generated'
  | 'mock_interview_started'
  | 'mock_interview_completed'
  | 'grammar_run'
  | 'translation_run'
  | 'company_research_run'
  | 'linkedin_imported'
  | 'resume_imported'
  | 'extension_token_created';

export function track(userId: string | null, event: AnalyticsEvent, metadata: Record<string, unknown> = {}): void {
  // Fire-and-forget: analytics must never break the user-facing request.
  void getDb()
    .query(
      'INSERT INTO analytics_events (id, user_id, event, metadata) VALUES ($1, $2, $3, $4)',
      [`evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`, userId, event, JSON.stringify(metadata)],
    )
    .catch((err) => {
      console.error(`analytics insert failed: ${err instanceof Error ? err.message : 'unknown'}`);
    });
}
