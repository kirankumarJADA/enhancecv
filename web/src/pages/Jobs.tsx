// Curevo AI — Public Job Discovery & Matching Hub (Phase 9E)
//
// 100% Public, Free, and Login-Free.
// Features:
//   - Search and filtering across roles, locations, remote types, and tech stacks
//   - Honest provider labeling: live API when configured, curated benchmark roles when not
//   - Transparent match scoring against candidate's active CV draft via /api/public/match
//   - 1-click Local Storage persistence for Saved Jobs
//   - 1-click Application creation (Kanban tracker)
//   - 1-click Resume Tailoring transition (/builder?mode=improve)

import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Logo, Spinner } from '../components/ui';
import { CURATED_JOBS, type CuratedJob } from '../data/curatedJobs';
import {
  getSavedJobs,
  saveJob,
  removeSavedJob,
  isJobSaved,
  createApplicationFromJob,
  type SavedJob,
} from '../lib/jobStorage';
import { loadActiveDraftResume } from '../lib/jobStorage';
import { getSampleCv } from '../data/sampleCv';
import type { ResumeData, MatchAnalysis, JobAnalysis } from '../types';

type Tab = 'browse' | 'saved' | 'import';

export default function Jobs() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('browse');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [remoteFilter, setRemoteFilter] = useState<'all' | 'remote' | 'hybrid' | 'on-site'>('all');
  const [employmentFilter, setEmploymentFilter] = useState<'all' | 'Full-time' | 'Contract' | 'Part-time'>('all');

  // Job data state
  const [jobs, setJobs] = useState<CuratedJob[]>(CURATED_JOBS);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(false);

  // Active CV & Matching state
  const [activeResume, setActiveResume] = useState<ResumeData | null>(null);
  const [activeResumeTitle, setActiveResumeTitle] = useState('Sample Engineering CV');
  const [matchingJobId, setMatchingJobId] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<Record<string, { score: number; matched: string[]; missing: string[] }>>({});

  // Modals & Details
  const [selectedJob, setSelectedJob] = useState<CuratedJob | SavedJob | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Custom Job Import Form
  const [importCompany, setImportCompany] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [importLocation, setImportLocation] = useState('Remote');
  const [importSalary, setImportSalary] = useState('');
  const [importRemote, setImportRemote] = useState<'remote' | 'hybrid' | 'on-site'>('remote');
  const [importDescription, setImportDescription] = useState('');

  // Load Active Resume from Draft or Sample CV
  useEffect(() => {
    try {
      const activeDraft = loadActiveDraftResume();
      if (activeDraft && activeDraft.resume) {
        setActiveResume(activeDraft.resume);
        setActiveResumeTitle(`${activeDraft.name} (${activeDraft.role})`);
      } else {
        const sample = getSampleCv();
        setActiveResume(sample);
        setActiveResumeTitle('Aarav Sharma (Sample Senior Cloud CV)');
      }
    } catch {
      setActiveResume(getSampleCv());
      setActiveResumeTitle('Sample Engineering CV');
    }
  }, []);

  // Check Provider Status & Load Jobs
  useEffect(() => {
    async function checkProviderAndFetch() {
      setLoading(true);
      try {
        const statusRes = await api.get<{ configured: boolean; provider: string }>('/public/jobs/status');
        setProviderConfigured(statusRes.configured);

        const discoverRes = await api.post<{
          jobs: CuratedJob[];
          total: number;
          source: string;
          isConfigured: boolean;
          message?: string;
        }>('/public/jobs/discover', {
          query: searchQuery,
          location: locationQuery,
          remoteType: remoteFilter !== 'all' ? remoteFilter : undefined,
          employmentType: employmentFilter !== 'all' ? employmentFilter : undefined,
        });

        if (discoverRes.jobs && discoverRes.jobs.length > 0) {
          setJobs(discoverRes.jobs);
        } else {
          setJobs(CURATED_JOBS);
        }
      } catch {
        // Fallback to local curated jobs if server offline
        setJobs(CURATED_JOBS);
        setProviderConfigured(false);
      } finally {
        setLoading(false);
      }
    }

    void checkProviderAndFetch();
  }, [searchQuery, locationQuery, remoteFilter, employmentFilter]);

  // Load Saved Jobs from localStorage
  const refreshSaved = () => {
    const list = getSavedJobs();
    setSavedJobs(list);
  };

  useEffect(() => {
    refreshSaved();
  }, []);

  const triggerToast = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => setActionSuccessMessage(null), 3500);
  };

  // Filter Jobs Locally for instant responsiveness
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const inTitle = j.title.toLowerCase().includes(q);
        const inCompany = j.company.toLowerCase().includes(q);
        const inDesc = j.description.toLowerCase().includes(q);
        const inTech = j.technologies?.some((t) => t.toLowerCase().includes(q));
        if (!inTitle && !inCompany && !inDesc && !inTech) return false;
      }
      if (locationQuery) {
        const loc = locationQuery.toLowerCase().trim();
        if (!j.location.toLowerCase().includes(loc)) return false;
      }
      if (remoteFilter !== 'all' && j.remote_type.toLowerCase() !== remoteFilter) {
        return false;
      }
      if (employmentFilter !== 'all' && j.employment_type.toLowerCase() !== employmentFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [jobs, searchQuery, locationQuery, remoteFilter, employmentFilter]);

  // Match Job against Active Resume via /api/public/match
  const handleMatchWithResume = async (job: CuratedJob | SavedJob) => {
    if (!activeResume) return;
    setMatchingJobId(job.id);
    try {
      const jobText = `${job.title} at ${job.company}\n\n${job.description}\n\nRequirements:\n${job.requirements}`;
      const res = await api.post<{ job: JobAnalysis; match: MatchAnalysis }>('/public/match', {
        resume: activeResume,
        jobText,
      });

      if (res.match) {
        const score = res.match.score;
        const matched = res.match.matchedSkills || [];
        const missing = res.match.missingSkills || [];

        setMatchResults((prev) => ({
          ...prev,
          [job.id]: { score, matched, missing },
        }));

        // If job is already saved, update its stored match score
        if (isJobSaved(job.id)) {
          saveJob({
            ...(job as SavedJob),
            match_score: score,
            matched_skills: matched,
            missing_skills: missing,
            saved_at: (job as SavedJob).saved_at || new Date().toISOString(),
          });
          refreshSaved();
        }

        triggerToast(`Match computed: ${score}% fit for ${job.title}!`);
      }
    } catch (err) {
      console.warn('Matching fallback:', err);
      // Client-side quick keyword match fallback if offline
      const resumeText = JSON.stringify(activeResume).toLowerCase();
      const tech = job.technologies || [];
      const matched = tech.filter((t) => resumeText.includes(t.toLowerCase()));
      const missing = tech.filter((t) => !resumeText.includes(t.toLowerCase()));
      const score = tech.length ? Math.round((matched.length / tech.length) * 100) : 70;

      setMatchResults((prev) => ({
        ...prev,
        [job.id]: { score, matched, missing },
      }));
      triggerToast(`Offline match evaluated: ${score}% match`);
    } finally {
      setMatchingJobId(null);
    }
  };

  // Toggle Save Job
  const handleToggleSave = (job: CuratedJob | SavedJob) => {
    if (isJobSaved(job.id)) {
      removeSavedJob(job.id);
      refreshSaved();
      triggerToast(`Removed "${job.title}" from saved jobs.`);
    } else {
      const match = matchResults[job.id];
      const toSave: SavedJob = {
        ...job,
        saved_at: new Date().toISOString(),
        match_score: match ? match.score : (job as SavedJob).match_score ?? null,
        matched_skills: match ? match.matched : (job as SavedJob).matched_skills ?? [],
        missing_skills: match ? match.missing : (job as SavedJob).missing_skills ?? [],
      };
      saveJob(toSave);
      refreshSaved();
      triggerToast(`Saved "${job.title}" to local jobs.`);
    }
  };

  // Track in Kanban Application Board
  const handleTrackApplication = (job: CuratedJob | SavedJob) => {
    const match = matchResults[job.id];
    const app = createApplicationFromJob(
      {
        ...job,
        match_score: match ? match.score : (job as SavedJob).match_score ?? null,
        saved_at: new Date().toISOString(),
      },
      'SAVED'
    );
    triggerToast(`Added "${app.role}" to your Application Tracker!`);
  };

  // Tailor Resume for this Job
  const handleTailorForJob = (job: CuratedJob | SavedJob) => {
    const fullText = `${job.title} at ${job.company}\n\nOverview:\n${job.description}\n\nRequirements:\n${job.requirements}`;
    try {
      sessionStorage.setItem('curevo_prefilled_jd', fullText);
      sessionStorage.setItem('curevo_prefilled_role', job.title);
      sessionStorage.setItem('curevo_prefilled_company', job.company);
    } catch {
      // ignore storage errors
    }
    navigate('/builder?mode=improve');
  };

  // Custom Job Import Submission
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importTitle.trim() || !importCompany.trim() || !importDescription.trim()) {
      triggerToast('Please provide Company, Job Title, and Description.');
      return;
    }

    const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const customJob: SavedJob = {
      id,
      title: importTitle.trim(),
      company: importCompany.trim(),
      location: importLocation.trim() || 'Remote',
      salary: importSalary.trim() || 'Competitive',
      remote_type: importRemote,
      employment_type: 'Full-time',
      url: '',
      source: 'Custom Pasted JD',
      posted_at: 'Just imported',
      description: importDescription.trim(),
      requirements: '',
      technologies: [],
      saved_at: new Date().toISOString(),
    };

    saveJob(customJob);
    refreshSaved();
    setTab('saved');
    triggerToast(`Imported "${customJob.title}" into Saved Jobs!`);

    // Reset form
    setImportCompany('');
    setImportTitle('');
    setImportSalary('');
    setImportDescription('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link to="/" className="inline-flex items-center gap-2">
              <Logo />
            </Link>
            <span className="hidden sm:inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
              Jobs & Market Match • 100% Free
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/builder"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              Resume Builder
            </Link>
            <Link
              to="/applications"
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-2xs hover:bg-teal-700"
            >
              Application Tracker
            </Link>
            <Link to="/" className="text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900">
              Home
            </Link>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {actionSuccessMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl flex items-center gap-2 border border-slate-800 animate-fade-in">
          <span className="text-teal-400">✓</span>
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 flex-1">
        {/* Banner with Active Resume Context */}
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-xs font-semibold tracking-wide uppercase text-teal-300">
                Transparent ATS Matching Active
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Job Discovery & Fit Analysis</h1>
            <p className="mt-1 text-sm text-slate-300">
              Matching roles directly against: <strong className="text-white">{activeResumeTitle}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/builder"
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition border border-white/20"
            >
              Edit Active Resume
            </Link>
            <Link
              to="/applications"
              className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 transition"
            >
              View Kanban Board ({savedJobs.length} Saved)
            </Link>
          </div>
        </div>

        {/* Status notice */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500 bg-white p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${providerConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span>
              <strong>Provider Status:</strong>{' '}
              {providerConfigured
                ? 'Live Provider API Connected'
                : 'Curated Benchmark Roles (Live Search API not configured — showing realistic industry benchmark roles)'}
            </span>
          </div>
          <span className="text-slate-400">All data saved locally in browser • No account required</span>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'browse'}
            onClick={() => setTab('browse')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition cursor-pointer ${
              tab === 'browse'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Browse Roles ({filteredJobs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'saved'}
            onClick={() => setTab('saved')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
              tab === 'saved'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Saved Jobs</span>
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
              {savedJobs.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'import'}
            onClick={() => setTab('import')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition cursor-pointer ${
              tab === 'import'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            + Paste / Import Job
          </button>
        </div>

        {/* TAB 1: BROWSE JOBS */}
        {tab === 'browse' && (
          <div className="space-y-6">
            {/* Search & Filters Card */}
            <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Title / Keyword Search */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Role or Keyword
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. Full-Stack, React, Python..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                {/* Location Search */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder="e.g. London, Remote, New York..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                {/* Remote Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Workplace Type
                  </label>
                  <select
                    value={remoteFilter}
                    onChange={(e) => setRemoteFilter(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white"
                  >
                    <option value="all">All Workplace Types</option>
                    <option value="remote">Remote Only</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="on-site">On-site</option>
                  </select>
                </div>

                {/* Employment Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Employment
                  </label>
                  <select
                    value={employmentFilter}
                    onChange={(e) => setEmploymentFilter(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white"
                  >
                    <option value="all">All Employment Types</option>
                    <option value="Full-time">Full-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Part-time">Part-time</option>
                  </select>
                </div>
              </div>

              {(searchQuery || locationQuery || remoteFilter !== 'all' || employmentFilter !== 'all') && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    Showing {filteredJobs.length} matching {filteredJobs.length === 1 ? 'role' : 'roles'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setLocationQuery('');
                      setRemoteFilter('all');
                      setEmploymentFilter('all');
                    }}
                    className="text-teal-700 font-semibold hover:underline cursor-pointer"
                  >
                    Reset all filters
                  </button>
                </div>
              )}
            </div>

            {/* Job Listings Grid */}
            {loading ? (
              <div className="py-16 text-center text-slate-400">
                <Spinner className="mx-auto h-8 w-8 text-teal-600 mb-2" />
                <p className="text-sm">Fetching and indexing job roles...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center bg-white">
                <h3 className="text-base font-semibold text-slate-900">No roles matched your search</h3>
                <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                  Try adjusting your search keywords, clearing workplace filters, or paste a custom job description.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setLocationQuery('');
                    setRemoteFilter('all');
                  }}
                  className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Show all roles
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredJobs.map((job) => {
                  const match = matchResults[job.id];
                  const saved = isJobSaved(job.id);

                  return (
                    <div
                      key={job.id}
                      className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 flex flex-col justify-between hover:border-slate-300 transition"
                    >
                      <div>
                        {/* Top Meta */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                              {job.company}
                            </span>
                            <h2 className="text-base font-bold text-slate-900 mt-0.5">{job.title}</h2>
                            <p className="text-xs text-slate-500 mt-1">
                              {[job.location, job.salary, job.remote_type, job.posted_at].filter(Boolean).join(' • ')}
                            </p>
                          </div>

                          {/* Match score badge or evaluate button */}
                          {match ? (
                            <div className="text-right shrink-0">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                  match.score >= 75
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : match.score >= 50
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {match.score}% Fit
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleMatchWithResume(job)}
                              disabled={matchingJobId === job.id}
                              className="shrink-0 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition cursor-pointer"
                              title="Compare this job requirements with your active CV"
                            >
                              {matchingJobId === job.id ? 'Scoring...' : '⚡ Match CV'}
                            </button>
                          )}
                        </div>

                        {/* Match Breakdown preview if scored */}
                        {match && (
                          <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs border border-slate-100 space-y-1">
                            <div className="flex items-center justify-between text-slate-700 font-medium">
                              <span>Matched skills ({match.matched.length})</span>
                              <span className="text-emerald-700 font-semibold">{match.matched.slice(0, 3).join(', ')}</span>
                            </div>
                            {match.missing.length > 0 && (
                              <div className="flex items-center justify-between text-slate-500">
                                <span>Skill gaps ({match.missing.length})</span>
                                <span className="text-rose-600">{match.missing.slice(0, 3).join(', ')}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Description Preview */}
                        <p className="mt-3 text-xs leading-relaxed text-slate-600 line-clamp-3">
                          {job.description}
                        </p>

                        {/* Technologies Tags */}
                        {job.technologies && job.technologies.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {job.technologies.slice(0, 5).map((t) => (
                              <span
                                key={t}
                                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                              >
                                {t}
                              </span>
                            ))}
                            {job.technologies.length > 5 && (
                              <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                                +{job.technologies.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleSave(job)}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer border ${
                              saved
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {saved ? '★ Saved' : '☆ Save Job'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTrackApplication(job)}
                            className="rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            + Track Application
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedJob(job)}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            View Details
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTailorForJob(job)}
                            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition cursor-pointer"
                          >
                            Tailor CV →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SAVED JOBS */}
        {tab === 'saved' && (
          <div className="space-y-4">
            {savedJobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center bg-white">
                <h3 className="text-base font-semibold text-slate-900">No saved jobs yet</h3>
                <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                  Browse roles and click &quot;Save Job&quot;, or paste a custom job posting to track it locally in your browser.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('browse')}
                  className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Explore Benchmark Roles
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {savedJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                            {job.company}
                          </span>
                          <h2 className="text-base font-bold text-slate-900 mt-0.5">{job.title}</h2>
                          <p className="text-xs text-slate-500 mt-1">
                            {[job.location, job.salary, job.remote_type].filter(Boolean).join(' • ')}
                          </p>
                        </div>

                        {job.match_score !== null && job.match_score !== undefined ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                            {job.match_score}% Fit
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMatchWithResume(job)}
                            className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800"
                          >
                            ⚡ Score Match
                          </button>
                        )}
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-slate-600 line-clamp-3">
                        {job.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSave(job)}
                        className="text-xs font-medium text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        Remove
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTrackApplication(job)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          + Track Application
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTailorForJob(job)}
                          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                        >
                          Tailor CV →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: IMPORT / PASTE JOB */}
        {tab === 'import' && (
          <div className="max-w-2xl mx-auto rounded-2xl bg-white p-6 shadow-xs border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Paste Custom Job Description</h2>
            <p className="text-xs text-slate-500 mt-1">
              Add any job posting from LinkedIn, Indeed, or company career pages. It will be saved locally and scored against your resume.
            </p>

            <form onSubmit={handleImportSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Company *</label>
                  <input
                    type="text"
                    required
                    value={importCompany}
                    onChange={(e) => setImportCompany(e.target.value)}
                    placeholder="e.g. Stripe, Acme Corp"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Job Title *</label>
                  <input
                    type="text"
                    required
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    placeholder="e.g. Senior Frontend Engineer"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Location</label>
                  <input
                    type="text"
                    value={importLocation}
                    onChange={(e) => setImportLocation(e.target.value)}
                    placeholder="e.g. London / Remote"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Salary (optional)</label>
                  <input
                    type="text"
                    value={importSalary}
                    onChange={(e) => setImportSalary(e.target.value)}
                    placeholder="e.g. £80k - £95k"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Workplace</label>
                  <select
                    value={importRemote}
                    onChange={(e) => setImportRemote(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white"
                  >
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="on-site">On-site</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Job Description & Requirements *
                </label>
                <textarea
                  required
                  rows={8}
                  value={importDescription}
                  onChange={(e) => setImportDescription(e.target.value)}
                  placeholder="Paste the full job posting requirements, role overview, and qualifications..."
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed focus:border-teal-500 focus:outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition cursor-pointer"
                >
                  Save & Analyze Match
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal: Job Details & Complete Requirements */}
        {selectedJob && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
          >
            <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-bold text-teal-700 uppercase">{selectedJob.company}</span>
                  <h2 className="text-xl font-bold text-slate-900">{selectedJob.title}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {[selectedJob.location, selectedJob.salary, selectedJob.remote_type, selectedJob.employment_type]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedJob(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs text-slate-700">
                <div>
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider mb-1">Role Overview</h3>
                  <p className="leading-relaxed whitespace-pre-line">{selectedJob.description}</p>
                </div>

                {selectedJob.requirements && (
                  <div>
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider mb-1">Requirements</h3>
                    <p className="leading-relaxed whitespace-pre-line">{selectedJob.requirements}</p>
                  </div>
                )}

                {selectedJob.technologies && selectedJob.technologies.length > 0 && (
                  <div>
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider mb-1">Technologies</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedJob.technologies.map((t) => (
                        <span key={t} className="rounded-md bg-slate-100 px-2 py-1 text-slate-800 font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleToggleSave(selectedJob);
                    setSelectedJob(null);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {isJobSaved(selectedJob.id) ? 'Remove from Saved' : 'Save Job Locally'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleTrackApplication(selectedJob);
                      setSelectedJob(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    + Track Application
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleTailorForJob(selectedJob);
                    }}
                    className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
                  >
                    Tailor Resume →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
