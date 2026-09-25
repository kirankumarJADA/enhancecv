// Shared frontend types (mirror of server domain model)

export type SectionKey =
  | 'summary'
  | 'experience'
  | 'projects'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'achievements';

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  headline?: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  link?: string;
  description?: string;
  bullets: string[];
  tech?: string[];
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  startDate: string;
  endDate: string;
  grade?: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer?: string;
  year?: string;
}

export interface LanguageItem {
  id: string;
  name: string;
  proficiency?: string;
}

export interface CustomSection {
  id: string;
  title: string;
  bullets: string[];
}

export interface ResumeData {
  personal: PersonalInfo;
  summary: string;
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
  skills: { technical: string[]; soft: string[] };
  certifications: CertificationItem[];
  languages: LanguageItem[];
  achievements: string[];
  customSections: CustomSection[];
  sectionOrder: SectionKey[];
  hiddenSections: SectionKey[];
}

export interface JobAnalysis {
  title: string;
  company: string;
  seniority: string;
  yearsRequired: number | null;
  requiredSkills: string[];
  preferredSkills: string[];
  softSkills: string[];
  responsibilities: string[];
  educationRequirements: string[];
  certificationRequirements: string[];
  keywords: string[];
  domainTerms: string[];
}

export type MatchStatus = 'matched' | 'partial' | 'missing' | 'unknown';

export interface MatchItem {
  requirement: string;
  type: 'required' | 'preferred' | 'soft' | 'education' | 'certification' | 'responsibility';
  status: MatchStatus;
  evidence: string;
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface MatchAnalysis {
  score: number;
  breakdown: ScoreComponent[];
  items: MatchItem[];
  matchedSkills: string[];
  partialSkills: string[];
  missingSkills: string[];
  keywordCoverage: { percent: number; matched: string[]; missing: string[] };
}

export interface AtsCheck {
  id: string;
  category: 'formatting' | 'structure' | 'content' | 'skills' | 'readability';
  passed: boolean;
  weight: number;
  message: string;
  recommendation?: string;
}

export interface ATSAnalysis {
  overallScore: number;
  formattingScore: number;
  structureScore: number;
  contentScore: number;
  skillsScore: number;
  readabilityScore: number;
  checks: AtsCheck[];
  working: string[];
  issues: { severity: string; message: string; recommendation: string }[];
  recommendations: string[];
  metrics: {
    bulletCount: number;
    quantifiedBulletRatio: number;
    actionVerbStartRatio: number;
    averageBulletWords: number;
    technicalSkillCount: number;
    estimatedPages: number;
  };
}

export interface ChangeLogEntry {
  type: string;
  section: string;
  before: string;
  after: string;
  reason: string;
  label?: string;
  evidence?: string;
}

export interface TruthReport {
  passedAll: boolean;
  checks: { bullet: string; status: 'supported' | 'warning' | 'reverted'; unsupportedClaims: string[]; note?: string }[];
  autoFixed: string[];
}

export interface Suggestion {
  id: string;
  section: string;
  itemId?: string;
  bulletIndex?: number;
  kind: string;
  current: string;
  suggested: string;
  reason: string;
}

export interface AgentMeta {
  provider: string;
  model: string;
  usedAi: boolean;
  iterations: number;
  repairCount: number;
  rejectedCount: number;
  errorCode?: string;
  aiConfigured: boolean;
  critique?: { summary: string; notes: string[] };
}

export interface AiStatus {
  enabled: boolean;
  provider: string;
  model: string;
  maxIterations: number;
}


export interface User {
  id: string;
  email: string;
  name: string;
  targetRole?: string;
  onboarded?: boolean;
  emailVerified?: boolean;
  role?: string;
}

export interface UsageSnapshot {
  plan: string;
  period: string;
  aiConfigured?: boolean;
  features: { feature: string; used: number; limit: number }[];
}

export interface BillingPlan {
  id: string;
  label: string;
  description: string;
  limits: Record<string, number>;
}

export interface BillingStatus {
  billingConfigured: boolean;
  plan: string;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasPaymentMethod: boolean;
  } | null;
}

export type ApplicationStatus = 'SAVED' | 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN';

export interface Application {
  id: string;
  company: string;
  role: string;
  job_url: string;
  location: string;
  salary: string;
  job_id: string | null;
  resume_id: string | null;
  cover_letter_id: string | null;
  template_id: string;
  applied_date: string;
  notes: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  job_title: string | null;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  atsSafe: boolean;
  bestFor: string[];
}

export interface TemplateRecommendation {
  templateId: string;
  reason: string;
  template: ResumeTemplate;
}

export interface CoverLetter {
  greeting: string;
  paragraphs: string[];
  closing: string;
}

export interface CoverLetterSummary {
  id: string;
  title: string;
  letter: CoverLetter;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedinSuggestions {
  headline: string;
  about: string;
  experienceBullets: { itemId: string; index: number; current: string; suggested: string; reason: string }[];
  skills: string[];
  summaryNote: string;
}

export interface ResumeSummary {
  id: string;
  kind: 'master' | 'tailored';
  title: string;
  atsScore: number | null;
  jobId: string | null;
  jobTitle: string | null;
  createdAt: string;
  updatedAt: string;
}
