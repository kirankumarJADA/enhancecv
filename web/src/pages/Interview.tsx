// Curevo AI — AI Interview Preparation & Mock Interview Coach (Phase 9F)
//
// 100% Public, anonymous, zero-auth, truth-grounded interview workspace.
// Features:
//   - Tab 1: Interview Preparation (Targeted questions, CV grounding, STAR guidance, study plan)
//   - Tab 2: STAR Answer Coach (Interactive 4-box STAR editor, Truth Guard check, refinement)
//   - Tab 3: AI Mock Interview (Question-by-question flow, adaptive follow-ups, final report)
//   - Tab 4: History & STAR Story Bank (Client-side localStorage persistence, JSON export/import)

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Spinner } from '../components/ui';
import Navbar from '../components/Navbar';
import CompanyResearchModal from '../components/CompanyResearchModal';
import EmailModal from '../components/EmailModal';
import {
  getInterviewSessions,
  saveInterviewSession,
  deleteInterviewSession,
  clearAllInterviewSessions,
  exportInterviewSessionJson,
  getSavedStarStories,
  saveStarStory,
  deleteStarStory,
  exportAllInterviewDataJson,
  importInterviewDataJson,
  type InterviewSession,
  type InterviewPrepQuestion,
  type SavedStarStory,
  type StarEvaluationResult,
  type MockAnswerRecord,
  type MockEvaluationResult,
  type FinalMockReportResult,
} from '../lib/interviewStorage';
import {
  isSpeechRecognitionSupported,
  VoiceTranscriber,
  speakQuestion,
  stopSpeaking,
} from '../lib/speechRecognition';
import type { ResumeData } from '../types';

type Tab = 'prepare' | 'star' | 'mock' | 'history';

const COMMON_QUESTIONS = [
  'Tell me about a challenging technical problem you solved and your contribution.',
  'Describe a time you had a significant disagreement with a teammate or stakeholder.',
  'How do you approach designing a scalable and reliable distributed system?',
  'Walk me through a project where requirements changed abruptly midway through development.',
  'Why are you interested in this role and what unique value do you bring to our team?',
  'Tell me about a time a production incident occurred under your watch and how you handled it.',
];

export default function Interview() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation & Active Tab
  const initialTab = (searchParams.get('tab') as Tab) || 'prepare';
  const [activeTab, setActiveTab] = useState<Tab>(['prepare', 'star', 'mock', 'history'].includes(initialTab) ? initialTab : 'prepare');

  // Resume Context from local draft
  const [activeResume, setActiveResume] = useState<ResumeData | null>(null);
  const [useResumeContext, setUseResumeContext] = useState<boolean>(true);

  // Global Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [researchCompany, setResearchCompany] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load draft resume on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw =
        window.localStorage.getItem('curevo_builder_draft_v1_anonymous') ||
        window.localStorage.getItem('curevo_builder_draft_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.resume && Array.isArray(parsed.resume.experience) && parsed.resume.experience.length > 0) {
          setActiveResume(parsed.resume);
        }
      }
    } catch {
      // ignore parsing errors
    }
  }, []);

  // Update URL search param on tab change
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      prev.set('tab', tab);
      return prev;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* Top Header */}
      <Navbar ctaText="Prepare App" ctaLink="/prepare-application" />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl flex items-center gap-2 border border-slate-800">
          <span className="text-teal-400">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Workspace */}
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 flex-1">
        {/* Banner with Active Resume Context */}
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-xs font-semibold tracking-wide uppercase text-teal-300">
                Truth Guard™ Grounded Coaching
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">AI Interview Preparation & Mock Coach</h1>
            <p className="mt-1 text-sm text-slate-300">
              {activeResume ? (
                <>
                  Grounding answers in:{' '}
                  <strong className="text-white">
                    {activeResume.personal.fullName || 'Active Resume'} ({activeResume.experience.length} roles,{' '}
                    {activeResume.skills.technical.length} skills)
                  </strong>
                </>
              ) : (
                'Prepare for technical, behavioural, situational, and HR questions with zero signup.'
              )}
            </p>
          </div>

          {activeResume && (
            <label className="flex items-center gap-2 text-xs font-medium bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700 cursor-pointer hover:bg-slate-700/80 transition">
              <input
                type="checkbox"
                checked={useResumeContext}
                onChange={(e) => setUseResumeContext(e.target.checked)}
                className="rounded border-slate-600 text-teal-500 focus:ring-teal-400"
              />
              <span>Use CV Evidence</span>
            </label>
          )}
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-6 overflow-x-auto">
          {[
            { id: 'prepare', label: '1. Interview Preparation' },
            { id: 'star', label: '2. STAR Answer Coach' },
            { id: 'mock', label: '3. AI Mock Interview' },
            { id: 'history', label: '4. History & Story Bank' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as Tab)}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Interview Preparation */}
        {activeTab === 'prepare' && (
          <PrepareTab
            activeResume={useResumeContext ? activeResume : null}
            searchParams={searchParams}
            showToast={showToast}
            onResearchCompany={(comp) => setResearchCompany(comp)}
            onSelectQuestionForStar={(q) => {
              setSearchParams((prev) => {
                prev.set('tab', 'star');
                prev.set('question', q.question);
                return prev;
              });
              setActiveTab('star');
            }}
          />
        )}

        {/* Tab 2: STAR Answer Coach */}
        {activeTab === 'star' && (
          <StarCoachTab
            activeResume={useResumeContext ? activeResume : null}
            searchParams={searchParams}
            showToast={showToast}
          />
        )}

        {/* Tab 3: AI Mock Interview Simulator */}
        {activeTab === 'mock' && (
          <MockInterviewTab
            activeResume={useResumeContext ? activeResume : null}
            searchParams={searchParams}
            showToast={showToast}
          />
        )}

        {/* Tab 4: History & Story Bank */}
        {activeTab === 'history' && <HistoryAndStoryBankTab showToast={showToast} />}

        {/* Company Research Modal */}
        <CompanyResearchModal
          isOpen={!!researchCompany}
          onClose={() => setResearchCompany(null)}
          companyName={researchCompany || ''}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Preparation Tab Component
// ---------------------------------------------------------------------------

function PrepareTab({
  activeResume,
  searchParams,
  showToast,
  onSelectQuestionForStar,
  onResearchCompany,
}: {
  activeResume: ResumeData | null;
  searchParams: URLSearchParams;
  showToast: (msg: string) => void;
  onSelectQuestionForStar: (q: InterviewPrepQuestion) => void;
  onResearchCompany?: (company: string) => void;
}) {
  const [role, setRole] = useState(searchParams.get('role') || '');
  const [company, setCompany] = useState(searchParams.get('company') || '');
  const [jdText, setJdText] = useState(searchParams.get('jd') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<InterviewPrepQuestion[]>([]);
  const [studyPlan, setStudyPlan] = useState<string[]>([]);
  const [checkedPlanSteps, setCheckedPlanSteps] = useState<Set<number>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [openSampleAnswers, setOpenSampleAnswers] = useState<Set<string>>(new Set());

  const handleGenerate = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{
        ok: boolean;
        questions: InterviewPrepQuestion[];
        studyPlan: string[];
        isFallback?: boolean;
      }>('/public/interview/prep', {
        resume: activeResume || undefined,
        jobDescription: jdText || undefined,
        targetRole: role || undefined,
        company: company || undefined,
      });

      setQuestions(res.questions || []);
      setStudyPlan(res.studyPlan || []);
      showToast(`Generated ${res.questions?.length || 0} role-tailored interview questions.`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to generate interview preparation package.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSession = () => {
    if (questions.length === 0) return;
    const session: InterviewSession = {
      id: `prep_${Date.now()}`,
      title: `${role || 'Target Role'} @ ${company || 'General'} Prep`,
      type: 'prep',
      target_role: role || 'General Role',
      company: company || 'General',
      job_description: jdText || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      prep_questions: questions,
      study_plan: studyPlan,
      is_completed: true,
    };
    saveInterviewSession(session);
    showToast('Interview preparation pack saved to History.');
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      if (q.category) set.add(q.category);
    });
    return Array.from(set);
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    if (categoryFilter === 'ALL') return questions;
    return questions.filter((q) => q.category === categoryFilter);
  }, [questions, categoryFilter]);

  const toggleSample = (id: string) => {
    setOpenSampleAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Configuration Form Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">Target Role & Opportunity</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Provide your target position and job details. We generate role-specific questions across technical, behavioural, situational, and HR categories.
        </p>

        <form onSubmit={handleGenerate} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Target Job Title</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 uppercase">Company / Organisation</label>
                {company.trim().length > 0 && onResearchCompany && (
                  <button
                    type="button"
                    onClick={() => onResearchCompany(company)}
                    className="text-2xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                  >
                    🏢 Research {company}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Monolith Financial Technologies"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Job Description or Requirements (optional)
            </label>
            <textarea
              rows={4}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste job posting text or key skills required..."
              className="w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed focus:border-teal-500 focus:outline-none font-mono"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              {activeResume ? '✓ Grounded in your authentic CV evidence' : 'Tip: Import a CV in Resume Builder to personalize answers'}
            </span>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <Spinner className="h-4 w-4 text-white" />}
              <span>{loading ? 'Analyzing & Generating...' : 'Generate Interview Questions'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {questions.length > 0 && (
        <div className="space-y-6">
          {/* Header & Save Action */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Prepared Questions ({questions.length})
              </h2>
              <p className="text-xs text-slate-500">
                Categorized by interview dimension with recommended answer structures and grounded sample responses.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveSession}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Save Preparation Pack
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              All ({questions.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat} ({questions.filter((q) => q.category === cat).length})
              </button>
            ))}
          </div>

          {/* Question Cards Grid */}
          <div className="grid gap-4">
            {filteredQuestions.map((q, idx) => (
              <div
                key={q.id || idx}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-teal-50 px-2 py-0.5 text-2xs font-bold text-teal-800 uppercase border border-teal-200">
                      {q.category}
                    </span>
                    <span className="text-xs text-slate-400">Q{idx + 1}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectQuestionForStar(q)}
                    className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 border border-teal-200 transition cursor-pointer flex items-center gap-1"
                  >
                    <span>Practice in STAR Coach</span>
                    <span>→</span>
                  </button>
                </div>

                <h3 className="mt-2 text-base font-bold text-slate-900">{q.question}</h3>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Why Interviewers Ask This
                    </span>
                    <p className="text-slate-600 leading-relaxed">{q.why_it_may_be_asked}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      CV Evidence Grounding
                    </span>
                    <p className="text-slate-600 leading-relaxed">{q.evidence_from_cv}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-teal-50/50 p-3 border border-teal-100 text-xs">
                  <span className="font-bold text-teal-900 uppercase tracking-wider block mb-1">
                    Recommended STAR Strategy
                  </span>
                  <p className="text-teal-950 leading-relaxed">{q.recommended_answer_structure}</p>
                </div>

                {q.sample_truthful_answer && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => toggleSample(q.id || String(idx))}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer flex items-center gap-1"
                    >
                      <span>{openSampleAnswers.has(q.id || String(idx)) ? 'Hide' : 'View'} Grounded Sample Answer</span>
                      <span>{openSampleAnswers.has(q.id || String(idx)) ? '▲' : '▼'}</span>
                    </button>
                    {openSampleAnswers.has(q.id || String(idx)) && (
                      <div className="mt-2 rounded-lg bg-slate-900 text-slate-100 p-4 text-xs leading-relaxed border border-slate-800">
                        <div className="flex items-center gap-2 mb-2 text-teal-400 font-semibold text-2xs uppercase">
                          <span>✓ Truth Guard Verified</span>
                          <span>•</span>
                          <span>Uses only verified facts from candidate profile</span>
                        </div>
                        <p className="italic">"{q.sample_truthful_answer}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actionable Study Plan Checklist */}
          {studyPlan.length > 0 && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>📋</span>
                <span>Actionable Interview Preparation Plan</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Concrete steps to prepare before your interview. Track your readiness by checking them off.
              </p>
              <div className="mt-4 space-y-2">
                {studyPlan.map((step, idx) => {
                  const isDone = checkedPlanSteps.has(idx);
                  return (
                    <label
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                        isDone ? 'bg-white border-teal-300 text-slate-400 line-through' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => {
                          setCheckedPlanSteps((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx);
                            else next.add(idx);
                            return next;
                          });
                        }}
                        className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-xs leading-relaxed">{step}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. STAR Coach Tab Component
// ---------------------------------------------------------------------------

function StarCoachTab({
  activeResume,
  searchParams,
  showToast,
}: {
  activeResume: ResumeData | null;
  searchParams: URLSearchParams;
  showToast: (msg: string) => void;
}) {
  const [question, setQuestion] = useState(searchParams.get('question') || COMMON_QUESTIONS[0]);
  const [situation, setSituation] = useState('');
  const [task, setTask] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [tagInput, setTagInput] = useState('technical, leadership');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<StarEvaluationResult | null>(null);

  // Voice Interaction State (Phase 9J)
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);
  const [dictatingField, setDictatingField] = useState<'situation' | 'action' | 'result' | null>(null);
  const [starTranscriber, setStarTranscriber] = useState<VoiceTranscriber | null>(null);

  useEffect(() => {
    return () => {
      stopSpeaking();
      starTranscriber?.stop();
    };
  }, [starTranscriber]);

  const handleToggleSpeak = () => {
    if (isSpeakingQuestion) {
      stopSpeaking();
      setIsSpeakingQuestion(false);
    } else {
      if (!question) return;
      setIsSpeakingQuestion(true);
      speakQuestion(
        question,
        () => setIsSpeakingQuestion(true),
        () => setIsSpeakingQuestion(false),
        () => setIsSpeakingQuestion(false)
      );
    }
  };

  const handleToggleDictation = (field: 'situation' | 'action' | 'result') => {
    if (dictatingField === field) {
      starTranscriber?.stop();
      setDictatingField(null);
      showToast('Voice dictation stopped.');
    } else {
      if (!isSpeechRecognitionSupported()) {
        showToast('Speech recognition is not supported in this browser.');
        return;
      }
      starTranscriber?.stop();
      const currentVal = field === 'situation' ? situation : field === 'action' ? action : result;
      const transcriber = new VoiceTranscriber({
        onTranscript: ({ finalTranscript }) => {
          if (field === 'situation') setSituation(finalTranscript);
          else if (field === 'action') setAction(finalTranscript);
          else setResult(finalTranscript);
        },
        onStateChange: (state) => {
          if (state !== 'listening') setDictatingField(null);
        },
        onError: (err) => {
          showToast(err);
          setDictatingField(null);
        },
      });
      setStarTranscriber(transcriber);
      const started = transcriber.start(currentVal);
      if (started) {
        setDictatingField(field);
        showToast(`Listening... Dictating into ${field.toUpperCase()}`);
      }
    }
  };

  const handleEvaluate = async (e: FormEvent) => {
    e.preventDefault();
    if (!situation && !task && !action && !result) {
      setError('Please provide at least one component of your STAR answer.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{ ok: boolean } & StarEvaluationResult>('/public/interview/star-coach', {
        question,
        star: { situation, task, action, result },
        resume: activeResume || undefined,
      });

      setEvaluation(res);
      showToast('STAR answer evaluated with Truth Guard checks.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Evaluation failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToStoryBank = () => {
    if (!situation && !action) return;
    const tags = tagInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const story: SavedStarStory = {
      id: `star_${Date.now()}`,
      title: question.slice(0, 80),
      question,
      situation,
      task,
      action,
      result,
      tags: tags.length ? tags : ['general'],
      evaluation: evaluation || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveStarStory(story);
    showToast('Saved to your STAR Story Bank!');
  };

  const handleApplyRefinement = () => {
    if (!evaluation?.suggestedStarRefinement) return;
    const ref = evaluation.suggestedStarRefinement;
    if (ref.situation) setSituation(ref.situation);
    if (ref.task) setTask(ref.task);
    if (ref.action) setAction(ref.action);
    if (ref.result) setResult(ref.result);
    showToast('Applied suggested refinement into your editor.');
  };

  return (
    <div className="space-y-6">
      {/* Intro & Question Selection */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">STAR Answer Coach</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Structure behavioural answers using the proven STAR framework: Situation, Task, Action, and Result. Get instant feedback on specificity, impact, and factual grounding.
        </p>

        <div className="mt-4">
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Interview Question</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Tell me about a time you resolved a technical conflict..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
            <select
              onChange={(e) => {
                if (e.target.value) setQuestion(e.target.value);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-teal-500 focus:outline-none bg-white text-slate-700"
            >
              <option value="">Preset Questions...</option>
              {COMMON_QUESTIONS.map((q, idx) => (
                <option key={idx} value={q}>
                  {q}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleToggleSpeak}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isSpeakingQuestion
                  ? 'border-rose-300 bg-rose-50 text-rose-700 animate-pulse'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title={isSpeakingQuestion ? 'Stop reading' : 'Read question aloud'}
            >
              <span>{isSpeakingQuestion ? '⏹ Stop' : '🔊 Listen'}</span>
            </button>
          </div>
        </div>

        {/* 4-Box STAR Editor */}
        <form onSubmit={handleEvaluate} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Situation */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                  S — Situation
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleDictation('situation')}
                    className={`text-2xs font-semibold px-2 py-0.5 rounded border transition cursor-pointer ${
                      dictatingField === 'situation'
                        ? 'border-rose-400 bg-rose-500 text-white animate-pulse'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {dictatingField === 'situation' ? '🔴 Recording...' : '🎤 Dictate'}
                  </button>
                  <span className="text-2xs text-slate-400">Context & Challenge</span>
                </div>
              </div>
              <textarea
                rows={4}
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="Set the scene: What organization or project were you on? What was the business context or problem to solve?"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-teal-500 focus:outline-none bg-white"
              />
            </div>

            {/* Task */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                  T — Task
                </span>
                <span className="text-2xs text-slate-400">Your Objective</span>
              </div>
              <textarea
                rows={4}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="What was your specific responsibility? What goal or deliverable were you accountable for?"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-teal-500 focus:outline-none bg-white"
              />
            </div>

            {/* Action */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                  A — Action (Most Critical)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleDictation('action')}
                    className={`text-2xs font-semibold px-2 py-0.5 rounded border transition cursor-pointer ${
                      dictatingField === 'action'
                        ? 'border-rose-400 bg-rose-500 text-white animate-pulse'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {dictatingField === 'action' ? '🔴 Recording...' : '🎤 Dictate'}
                  </button>
                  <span className="text-2xs text-slate-400">What YOU Did</span>
                </div>
              </div>
              <textarea
                rows={5}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Detail the concrete steps YOU took. Mention tools, architectures, trade-offs, and how you led or collaborated."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-teal-500 focus:outline-none bg-white"
              />
            </div>

            {/* Result */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                  R — Result
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleDictation('result')}
                    className={`text-2xs font-semibold px-2 py-0.5 rounded border transition cursor-pointer ${
                      dictatingField === 'result'
                        ? 'border-rose-400 bg-rose-500 text-white animate-pulse'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {dictatingField === 'result' ? '🔴 Recording...' : '🎤 Dictate'}
                  </button>
                  <span className="text-2xs text-slate-400">Measurable Impact</span>
                </div>
              </div>
              <textarea
                rows={5}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="Quantify outcomes: Latency reduced? Team velocity increased? Revenue saved? What did you learn?"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-teal-500 focus:outline-none bg-white"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Tags (e.g. system design, conflict)"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveToStoryBank}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Save Story
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Spinner className="h-4 w-4 text-white" />}
              <span>{loading ? 'Evaluating Structure & Truth Guard...' : 'Evaluate with STAR Coach'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Evaluation Results Card */}
      {evaluation && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">STAR Coach Feedback</h3>
              <p className="text-xs text-slate-500 mt-0.5">{evaluation.overallSummary}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Relevance:</span>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase ${
                  evaluation.relevance.level === 'high'
                    ? 'bg-emerald-100 text-emerald-800'
                    : evaluation.relevance.level === 'medium'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {evaluation.relevance.level}
              </span>
            </div>
          </div>

          {/* Truth Guard Alert Banner */}
          {evaluation.unsupportedClaims && evaluation.unsupportedClaims.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold mb-1">
                <span>⚠️</span>
                <span>Truth Guard Alert: Ungrounded Claims Detected</span>
              </div>
              <p className="leading-relaxed">
                The following statements introduce metrics or achievements not verified in your CV:
              </p>
              <ul className="list-disc list-inside mt-1 font-mono text-2xs space-y-0.5">
                {evaluation.unsupportedClaims.map((claim, idx) => (
                  <li key={idx}>{claim}</li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-amber-800">
                Ensure all metrics and company names match your authentic background to pass background checks.
              </p>
            </div>
          )}

          {/* Framework Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <span className="font-bold text-slate-800 uppercase tracking-wider block mb-1">Structure</span>
              <p className="text-slate-600 leading-relaxed">{evaluation.structureFeedback}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <span className="font-bold text-slate-800 uppercase tracking-wider block mb-1">Clarity</span>
              <p className="text-slate-600 leading-relaxed">{evaluation.clarityFeedback}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <span className="font-bold text-slate-800 uppercase tracking-wider block mb-1">Specificity</span>
              <p className="text-slate-600 leading-relaxed">{evaluation.specificityFeedback}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
              <span className="font-bold text-slate-800 uppercase tracking-wider block mb-1">Impact</span>
              <p className="text-slate-600 leading-relaxed">{evaluation.impactFeedback}</p>
            </div>
          </div>

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {evaluation.strengths && evaluation.strengths.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <span className="font-bold text-emerald-900 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  <span>✓</span>
                  <span>Key Strengths</span>
                </span>
                <ul className="space-y-1 text-emerald-950">
                  {evaluation.strengths.map((s, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-emerald-600">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.improvements && evaluation.improvements.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <span className="font-bold text-amber-900 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  <span>↑</span>
                  <span>Areas for Improvement</span>
                </span>
                <ul className="space-y-1 text-amber-950">
                  {evaluation.improvements.map((imp, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-amber-600">•</span>
                      <span>{imp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Suggested Refinement */}
          {evaluation.suggestedStarRefinement && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Suggested Truth-Grounded Refinement</span>
                </span>
                <button
                  type="button"
                  onClick={handleApplyRefinement}
                  className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700 transition cursor-pointer"
                >
                  Apply into Editor
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {evaluation.suggestedStarRefinement.situation && (
                  <div>
                    <span className="font-bold text-teal-950 uppercase block">Situation:</span>
                    <p className="text-slate-700 italic">{evaluation.suggestedStarRefinement.situation}</p>
                  </div>
                )}
                {evaluation.suggestedStarRefinement.task && (
                  <div>
                    <span className="font-bold text-teal-950 uppercase block">Task:</span>
                    <p className="text-slate-700 italic">{evaluation.suggestedStarRefinement.task}</p>
                  </div>
                )}
                {evaluation.suggestedStarRefinement.action && (
                  <div>
                    <span className="font-bold text-teal-950 uppercase block">Action:</span>
                    <p className="text-slate-700 italic">{evaluation.suggestedStarRefinement.action}</p>
                  </div>
                )}
                {evaluation.suggestedStarRefinement.result && (
                  <div>
                    <span className="font-bold text-teal-950 uppercase block">Result:</span>
                    <p className="text-slate-700 italic">{evaluation.suggestedStarRefinement.result}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Mock Interview Simulation Tab Component
// ---------------------------------------------------------------------------

function MockInterviewTab({
  activeResume,
  searchParams,
  showToast,
}: {
  activeResume: ResumeData | null;
  searchParams: URLSearchParams;
  showToast: (msg: string) => void;
}) {
  const [stage, setStage] = useState<'config' | 'active' | 'finished'>('config');

  // Config
  const [role, setRole] = useState(searchParams.get('role') || 'Software Engineer');
  const [company, setCompany] = useState(searchParams.get('company') || 'Technology Co.');
  const [difficulty, setDifficulty] = useState<'entry' | 'mid' | 'senior' | 'lead'>('senior');
  const [totalQuestionsCount, setTotalQuestionsCount] = useState<number>(3);

  // Active Simulation
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [scheduledQuestions, setScheduledQuestions] = useState<{ id: string; category: string; question: string }[]>([]);
  const [candidateAnswer, setCandidateAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeEvaluation, setActiveEvaluation] = useState<MockEvaluationResult | null>(null);
  const [answersLog, setAnswersLog] = useState<MockAnswerRecord[]>([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  // Voice Interaction State (Phase 9J)
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);
  const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
  const [transcriberInstance, setTranscriberInstance] = useState<VoiceTranscriber | null>(null);

  // Stop audio on unmount or question change
  useEffect(() => {
    return () => {
      stopSpeaking();
      transcriberInstance?.stop();
    };
  }, [transcriberInstance]);

  const handleToggleSpeakQuestion = () => {
    if (isSpeakingQuestion) {
      stopSpeaking();
      setIsSpeakingQuestion(false);
    } else {
      const q = scheduledQuestions[activeQuestionIndex]?.question;
      if (!q) return;
      setIsSpeakingQuestion(true);
      speakQuestion(
        q,
        () => setIsSpeakingQuestion(true),
        () => setIsSpeakingQuestion(false),
        () => setIsSpeakingQuestion(false)
      );
    }
  };

  const handleToggleRecording = () => {
    if (isRecordingAnswer) {
      transcriberInstance?.stop();
      setIsRecordingAnswer(false);
      showToast('Voice transcription stopped.');
    } else {
      if (!isSpeechRecognitionSupported()) {
        showToast('Speech recognition is not supported in this browser. Please type your response.');
        return;
      }
      const transcriber = new VoiceTranscriber({
        onTranscript: ({ finalTranscript }) => {
          setCandidateAnswer(finalTranscript);
        },
        onStateChange: (state) => {
          setIsRecordingAnswer(state === 'listening');
        },
        onError: (err) => {
          showToast(err);
          setIsRecordingAnswer(false);
        },
      });
      setTranscriberInstance(transcriber);
      const started = transcriber.start(candidateAnswer);
      if (started) {
        setIsRecordingAnswer(true);
        showToast('Listening... Speak your answer now.');
      }
    }
  };

  // Final Report
  const [finalReport, setFinalReport] = useState<FinalMockReportResult | null>(null);
  const [isGeneratingFinal, setIsGeneratingFinal] = useState(false);

  // Start Simulation
  const handleStartInterview = async () => {
    // Generate starter questions based on role & difficulty
    const starterQuestions = [
      {
        id: 'mock_q1',
        category: 'TECHNICAL',
        question: `Walk me through how you would architect a critical feature for a ${role} role, and what technical trade-offs you would make.`,
      },
      {
        id: 'mock_q2',
        category: 'BEHAVIOURAL',
        question: `Describe a situation where a project deadline was at risk. How did you prioritize tasks and communicate with stakeholders?`,
      },
      {
        id: 'mock_q3',
        category: 'SITUATIONAL',
        question: `Imagine you uncover a severe security vulnerability or data inconsistency in production. What are your immediate first three steps?`,
      },
      {
        id: 'mock_q4',
        category: 'LEADERSHIP',
        question: `How do you mentor more junior engineers or advocate for best practices across cross-functional teams?`,
      },
      {
        id: 'mock_q5',
        category: 'HR',
        question: `What excites you most about working at ${company}, and where do you want your engineering career to head over the next two years?`,
      },
    ].slice(0, totalQuestionsCount);

    setScheduledQuestions(starterQuestions);
    setActiveQuestionIndex(0);
    setAnswersLog([]);
    setActiveEvaluation(null);
    setCandidateAnswer('');
    setStage('active');
    showToast('Mock interview started. Good luck!');
  };

  // Submit Answer to Active Question
  const handleSubmitAnswer = async (e: FormEvent) => {
    e.preventDefault();
    if (!candidateAnswer.trim()) return;

    const currentQ = scheduledQuestions[activeQuestionIndex];
    setIsSubmitting(true);

    try {
      const res = await api.post<{ ok: boolean } & MockEvaluationResult>('/public/interview/mock-evaluate', {
        question: currentQ.question,
        answer: candidateAnswer,
        difficulty,
        questionNumber: activeQuestionIndex + 1,
        totalQuestions: scheduledQuestions.length,
        resume: activeResume || undefined,
      });

      setActiveEvaluation(res);

      const record: MockAnswerRecord = {
        questionId: currentQ.id,
        category: currentQ.category,
        question: currentQ.question,
        answer: candidateAnswer,
        evaluation: res,
        answered_at: new Date().toISOString(),
      };

      setAnswersLog((prev) => [...prev, record]);
      showToast('Answer evaluated. Review feedback or proceed to next question.');
    } catch (err) {
      showToast('Evaluation failed; please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Next Question or Finish
  const handleNextOrFinish = async () => {
    stopSpeaking();
    setIsSpeakingQuestion(false);
    transcriberInstance?.stop();
    setIsRecordingAnswer(false);
    if (activeQuestionIndex + 1 < scheduledQuestions.length) {
      setActiveQuestionIndex((prev) => prev + 1);
      setCandidateAnswer('');
      setActiveEvaluation(null);
    } else {
      await handleFinishInterview();
    }
  };

  // Generate Final Report
  const handleFinishInterview = async () => {
    stopSpeaking();
    setIsSpeakingQuestion(false);
    transcriberInstance?.stop();
    setIsRecordingAnswer(false);
    setIsGeneratingFinal(true);
    setStage('finished');

    try {
      const payload = answersLog.map((item) => ({
        question: item.question,
        category: item.category,
        answer: item.answer,
        evaluation: item.evaluation,
      }));

      const res = await api.post<{ ok: boolean } & FinalMockReportResult>('/public/interview/mock-final', {
        questionsAndAnswers: payload.length ? payload : [{ question: 'Sample question', answer: 'Sample answer' }],
        difficulty,
        resume: activeResume || undefined,
      });

      setFinalReport(res);
      showToast('Interview simulation complete! Performance report generated.');
    } catch (err) {
      showToast('Failed to compile final report.');
    } finally {
      setIsGeneratingFinal(false);
    }
  };

  // Save Session
  const handleSaveCompletedSession = () => {
    const session: InterviewSession = {
      id: `mock_${Date.now()}`,
      title: `${role} Mock Interview (${difficulty})`,
      type: 'mock',
      target_role: role,
      company,
      difficulty,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mock_answers: answersLog,
      final_report: finalReport || undefined,
      is_completed: true,
    };

    saveInterviewSession(session);
    showToast('Interview transcript & report saved to History.');
  };

  return (
    <div className="space-y-6">
      {/* Configuration Stage */}
      {stage === 'config' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-slate-900">Configure AI Mock Interview</h2>
          <p className="text-xs text-slate-500 mt-1">
            Simulate a realistic, interactive interview with question-by-question qualitative evaluations and adaptive follow-up challenges.
          </p>

          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Target Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Company</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Difficulty Level</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white"
                >
                  <option value="entry">Entry-Level / Junior</option>
                  <option value="mid">Mid-Level Engineer</option>
                  <option value="senior">Senior Engineer</option>
                  <option value="lead">Lead / Principal / Architect</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Number of Questions</label>
                <select
                  value={totalQuestionsCount}
                  onChange={(e) => setTotalQuestionsCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white"
                >
                  <option value={3}>3 Questions (Quick Sprint)</option>
                  <option value={4}>4 Questions (Balanced Round)</option>
                  <option value={5}>5 Questions (Comprehensive Mock)</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {activeResume ? '✓ Grounded in your CV profile' : 'Standard questions without CV grounding'}
              </span>
              <button
                type="button"
                onClick={handleStartInterview}
                className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition cursor-pointer"
              >
                Start Mock Interview →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Simulation Stage */}
      {stage === 'active' && scheduledQuestions[activeQuestionIndex] && (
        <div className="space-y-6">
          {/* Progress & Header */}
          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-white text-xs font-bold">
                {activeQuestionIndex + 1}
              </span>
              <div>
                <span className="text-xs font-bold text-slate-900">
                  Question {activeQuestionIndex + 1} of {scheduledQuestions.length}
                </span>
                <span className="text-2xs text-slate-400 block">
                  {role} • {difficulty.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFinishInterview}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Finish Early
              </button>
            </div>
          </div>

          {/* Interviewer Question Box */}
          <div className="rounded-2xl border-2 border-teal-600 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-teal-100 text-teal-800 text-2xs font-bold px-2 py-0.5 uppercase">
                  {scheduledQuestions[activeQuestionIndex].category}
                </span>
                <span className="text-xs text-slate-500">Interviewer Question</span>
              </div>
              <button
                type="button"
                onClick={handleToggleSpeakQuestion}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  isSpeakingQuestion
                    ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 animate-pulse'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                title={isSpeakingQuestion ? 'Stop reading' : 'Read question aloud using browser speech'}
              >
                <span>{isSpeakingQuestion ? '⏹ Stop Audio' : '🔊 Listen to Question'}</span>
              </button>
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-snug">
              "{scheduledQuestions[activeQuestionIndex].question}"
            </h2>
          </div>

          {/* Candidate Answer Box */}
          <form onSubmit={handleSubmitAnswer} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase">Your Spoken / Written Response</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleRecording}
                  disabled={isSubmitting || activeEvaluation !== null}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                    isRecordingAnswer
                      ? 'border-rose-400 bg-rose-500 text-white hover:bg-rose-600 animate-pulse'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  title={isRecordingAnswer ? 'Stop recording voice' : 'Dictate your response using your microphone'}
                >
                  <span>{isRecordingAnswer ? '🔴 Listening... (Click to stop)' : '🎤 Speak Answer'}</span>
                </button>
                <span className="text-2xs text-slate-400">
                  {candidateAnswer.trim().split(/\s+/).filter(Boolean).length} words
                </span>
              </div>
            </div>

            <textarea
              rows={6}
              value={candidateAnswer}
              onChange={(e) => setCandidateAnswer(e.target.value)}
              placeholder="Structure your answer clearly: start with context, explain your direct action, and highlight measurable outcomes..."
              className="w-full rounded-xl border border-slate-300 p-3.5 text-sm leading-relaxed focus:border-teal-500 focus:outline-none font-sans"
              disabled={isSubmitting || activeEvaluation !== null}
            />

            {isRecordingAnswer && (
              <div className="flex items-center justify-between rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-800 animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  <span>Microphone active — speaking is transcribed live. Audio is processed locally and never stored.</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleRecording}
                  className="font-bold underline text-teal-900 hover:text-black cursor-pointer"
                >
                  Done Speaking
                </button>
              </div>
            )}

            {!activeEvaluation && (
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !candidateAnswer.trim()}
                  className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Spinner className="h-4 w-4 text-white" />}
                  <span>{isSubmitting ? 'Evaluating Response...' : 'Submit Answer'}</span>
                </button>
              </div>
            )}
          </form>

          {/* Feedback & Follow-Up Section */}
          {activeEvaluation && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Instant Qualitative Feedback</h3>
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase ${
                    activeEvaluation.relevance.level === 'high'
                      ? 'bg-emerald-100 text-emerald-800'
                      : activeEvaluation.relevance.level === 'medium'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  Relevance: {activeEvaluation.relevance.level}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{activeEvaluation.overallFeedback}</p>

              {/* Dimensions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="font-bold text-slate-700 uppercase block mb-1">Structure</span>
                  <p className="text-slate-600">{activeEvaluation.structure}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="font-bold text-slate-700 uppercase block mb-1">Clarity</span>
                  <p className="text-slate-600">{activeEvaluation.clarity}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="font-bold text-slate-700 uppercase block mb-1">Specificity</span>
                  <p className="text-slate-600">{activeEvaluation.specificity}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="font-bold text-slate-700 uppercase block mb-1">Impact</span>
                  <p className="text-slate-600">{activeEvaluation.impact}</p>
                </div>
              </div>

              {/* Adaptive Follow-Up Question */}
              {activeEvaluation.followUpQuestion && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                  <span className="text-xs font-bold text-teal-900 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                    <span>💬</span>
                    <span>Interviewer Follow-Up Question</span>
                  </span>
                  <p className="text-xs text-teal-950 font-medium italic">
                    "{activeEvaluation.followUpQuestion}"
                  </p>
                </div>
              )}

              {/* Proceed Action */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleNextOrFinish}
                  className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition cursor-pointer"
                >
                  {activeQuestionIndex + 1 < scheduledQuestions.length ? 'Next Question →' : 'Complete & View Final Report →'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Final Performance Report Stage */}
      {stage === 'finished' && (
        <div className="space-y-6">
          {isGeneratingFinal ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <Spinner className="h-8 w-8 text-teal-600 mx-auto" />
              <h2 className="mt-4 text-lg font-bold text-slate-900">Synthesizing Final Performance Report</h2>
              <p className="text-xs text-slate-500 mt-1">
                Evaluating qualitative competencies, recurring strengths, and actionable next steps...
              </p>
            </div>
          ) : finalReport ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <span className="text-xs font-bold text-teal-700 uppercase">Final Evaluation</span>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Interview Simulation Performance Report
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {role} • {difficulty.toUpperCase()} • {answersLog.length} questions completed
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Overall Rating:</span>
                  <span
                    className={`rounded-full px-4 py-1 text-xs font-bold uppercase ${
                      finalReport.overallRating === 'exceptional'
                        ? 'bg-emerald-100 text-emerald-800'
                        : finalReport.overallRating === 'proficient'
                        ? 'bg-teal-100 text-teal-800'
                        : finalReport.overallRating === 'developing'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {finalReport.overallRating.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                <span className="font-bold text-slate-900 uppercase block mb-1">Executive Summary</span>
                <p>{finalReport.summary}</p>
              </div>

              {/* Competency Breakdown */}
              {finalReport.competencyBreakdown && finalReport.competencyBreakdown.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                    Competency Breakdown
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {finalReport.competencyBreakdown.map((comp, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 p-4 bg-white">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900">{comp.category}</span>
                          <span className="text-2xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            {comp.scoreLabel}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{comp.feedback}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths & Critical Areas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {finalReport.keyStrengths && finalReport.keyStrengths.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                    <span className="font-bold text-emerald-900 uppercase tracking-wider block mb-2">
                      Recurring Strengths
                    </span>
                    <ul className="space-y-1.5 text-emerald-950">
                      {finalReport.keyStrengths.map((s, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-emerald-600 font-bold">✓</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {finalReport.criticalAreasForImprovement && finalReport.criticalAreasForImprovement.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-2">
                      Critical Areas for Improvement
                    </span>
                    <ul className="space-y-1.5 text-amber-950">
                      {finalReport.criticalAreasForImprovement.map((imp, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-600 font-bold">!</span>
                          <span>{imp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Recommended Prep Steps */}
              {finalReport.recommendedPreparationSteps && finalReport.recommendedPreparationSteps.length > 0 && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-xs">
                  <span className="font-bold text-teal-900 uppercase tracking-wider block mb-2">
                    Recommended Next Steps Before Live Interview
                  </span>
                  <ul className="space-y-1.5 text-teal-950">
                    {finalReport.recommendedPreparationSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-teal-600 font-bold">→</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStage('config')}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  ← Start New Simulation
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEmailModalOpen(true)}
                    className="rounded-lg border border-teal-600 bg-white px-4 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>✉️ Email Report to Me</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCompletedSession}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition cursor-pointer"
                  >
                    Save to Session History
                  </button>
                </div>
              </div>

              {/* Email Report Modal */}
              <EmailModal
                isOpen={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                title="Email Interview Report to Me"
                type="interview-report"
                payload={{
                  role,
                  summary: `${finalReport.summary}\n\nStrengths:\n${finalReport.keyStrengths?.map((s) => `• ${s}`).join('\n') || 'N/A'}\n\nAreas for Improvement:\n${finalReport.criticalAreasForImprovement?.map((a) => `• ${a}`).join('\n') || 'N/A'}`,
                }}
                onSuccess={(msg) => showToast(msg)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. History & STAR Story Bank Tab Component
// ---------------------------------------------------------------------------

function HistoryAndStoryBankTab({ showToast }: { showToast: (msg: string) => void }) {
  const [subTab, setSubTab] = useState<'sessions' | 'stories'>('sessions');
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [stories, setStories] = useState<SavedStarStory[]>([]);
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(null);

  const refreshData = () => {
    setSessions(getInterviewSessions());
    setStories(getSavedStarStories());
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleDeleteSession = (id: string) => {
    deleteInterviewSession(id);
    refreshData();
    if (selectedSession?.id === id) setSelectedSession(null);
    showToast('Session removed from history.');
  };

  const handleDeleteStory = (id: string) => {
    deleteStarStory(id);
    refreshData();
    showToast('Story removed from STAR Bank.');
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all interview session history?')) {
      clearAllInterviewSessions();
      refreshData();
      setSelectedSession(null);
      showToast('All sessions cleared.');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importInterviewDataJson(content);
      if (res.success) {
        refreshData();
        showToast(`Imported ${res.sessionsImported} sessions and ${res.storiesImported} STAR stories.`);
      } else {
        showToast(`Import failed: ${res.error || 'Invalid file format'}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('sessions')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              subTab === 'sessions'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Saved Sessions ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('stories')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              subTab === 'stories'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            STAR Story Bank ({stories.length})
          </button>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportAllInterviewDataJson}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Export All (JSON)
          </button>
          <label className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
            <span>Import Backup</span>
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer"
            >
              Clear Sessions
            </button>
          )}
        </div>
      </div>

      {/* Sessions Sub-Tab */}
      {subTab === 'sessions' && (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
              <span className="text-3xl block mb-2">📁</span>
              <h3 className="text-base font-bold text-slate-900">No Saved Sessions Yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Generate a prep package or complete a mock interview simulation. Your records will be saved here in local storage.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-2xs font-bold text-teal-800 uppercase border border-teal-200">
                        {s.type}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">{s.title}</h4>
                    </div>
                    <p className="text-2xs text-slate-400 mt-1">
                      {new Date(s.created_at).toLocaleDateString()} • {s.target_role} @ {s.company}
                      {s.mock_answers ? ` • ${s.mock_answers.length} answers` : ''}
                      {s.prep_questions ? ` • ${s.prep_questions.length} questions` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportInterviewSessionJson(s)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.id)}
                      className="rounded-lg p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                      title="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STAR Story Bank Sub-Tab */}
      {subTab === 'stories' && (
        <div className="space-y-4">
          {stories.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
              <span className="text-3xl block mb-2">⭐</span>
              <h3 className="text-base font-bold text-slate-900">Story Bank is Empty</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Save polished STAR stories from the STAR Coach tab to build your personal library of interview examples.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {stories.map((story) => (
                <div key={story.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{story.title}</h4>
                    <button
                      type="button"
                      onClick={() => handleDeleteStory(story.id)}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-700">
                    <div>
                      <span className="font-bold text-teal-900 text-2xs uppercase block">S:</span>
                      <p className="line-clamp-2">{story.situation}</p>
                    </div>
                    <div>
                      <span className="font-bold text-teal-900 text-2xs uppercase block">T:</span>
                      <p className="line-clamp-2">{story.task}</p>
                    </div>
                    <div>
                      <span className="font-bold text-teal-900 text-2xs uppercase block">A:</span>
                      <p className="line-clamp-2">{story.action}</p>
                    </div>
                    <div>
                      <span className="font-bold text-teal-900 text-2xs uppercase block">R:</span>
                      <p className="line-clamp-2">{story.result}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                    {story.tags.map((tag) => (
                      <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-2xs text-slate-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
