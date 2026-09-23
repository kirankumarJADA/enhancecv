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

export interface User {
  id: string;
  email: string;
  name: string;
  targetRole?: string;
  onboarded?: boolean;
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
