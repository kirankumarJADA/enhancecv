// Privacy-conscious first-party product analytics.
//
// In the stateless, no-login architecture, product events are not persisted to SQL.
// Tracking failures must never break a request, and no database connection is ever created.

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

export function track(_userId: string | null, _event: AnalyticsEvent, _metadata: Record<string, unknown> = {}): void {
  // Stateless, privacy-first: in the no-login architecture, product events are not persisted to SQL.
  // Tracking failures must never break a request, and no database connection is ever created.
}
