// EnhanceCV core domain types.
// The resume data model is informed by the MIT-licensed atsresume project
// (https://github.com/sauravhathi/atsresume), cleaned up and extended for
// server-side persistence, matching and tailoring.

export type SectionKey =
  | 'summary'
  | 'experience'
  | 'projects'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'achievements';

export const ALL_SECTIONS: SectionKey[] = [
  'summary',
  'experience',
  'projects',
  'education',
  'skills',
  'certifications',
  'languages',
  'achievements',
];

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'summary',
  'experience',
  'projects',
  'skills',
  'education',
  'certifications',
  'languages',
  'achievements',
];

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  headline?: string; // current / target job title, e.g. "Java Backend Engineer"
}

export interface ExperienceItem {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate: string; // "MM/YYYY" or "YYYY" or "" if unknown
  endDate: string; // "" or "Present"
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

export interface SkillsData {
  technical: string[];
  soft: string[];
}

export interface CustomSection {
  id: string;          // 'custom_<slug>_<rand>' — also used in sectionOrder
  title: string;       // e.g. Publications, Volunteering, Interests
  bullets: string[];
}

export interface ResumeData {
  personal: PersonalInfo;
  summary: string;
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
  skills: SkillsData;
  certifications: CertificationItem[];
  languages: LanguageItem[];
  achievements: string[];
  customSections: CustomSection[];
  sectionOrder: SectionKey[];  // core keys + 'custom_*' ids
  hiddenSections: SectionKey[]; // core keys + 'custom_*' ids
}

export type ResumeKind = 'master' | 'tailored';

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
  score: number; // 0-100
  weight: number; // sums to 100 with the others
  detail: string;
}

export interface MatchAnalysis {
  score: number; // 0-100 EnhanceCV Job Match
  breakdown: ScoreComponent[];
  items: MatchItem[];
  matchedSkills: string[];
  partialSkills: string[];
  missingSkills: string[];
  keywordCoverage: { percent: number; matched: string[]; missing: string[] };
}

export type Severity = 'info' | 'warning' | 'critical';

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
  issues: { severity: Severity; message: string; recommendation: string }[];
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

export interface TruthCheck {
  bullet: string;
  status: 'supported' | 'warning' | 'reverted';
  unsupportedClaims: string[];
  note?: string;
}

export interface TruthReport {
  passedAll: boolean;
  checks: TruthCheck[];
  autoFixed: string[];
}

export type ChangeType = 'summary' | 'bullet' | 'phrasing' | 'order' | 'emphasis';

export interface ChangeLogEntry {
  type: ChangeType;
  section: string;
  before: string;
  after: string;
  reason: string;
  /** Human-friendly taxonomy label, e.g. "bullet_rewrite". */
  label?: string;
  /** Where the supporting facts come from — never claimed if unsupported. */
  evidence?: string;
}

export interface TailoringResult {
  resume: ResumeData;
  changeLog: ChangeLogEntry[];
  truth: TruthReport;
}

export interface Suggestion {
  id: string;
  section: string;
  itemId?: string;
  bulletIndex?: number;
  kind: 'bullet' | 'summary' | 'skill' | 'quantification';
  current: string;
  suggested: string;
  reason: string;
}
