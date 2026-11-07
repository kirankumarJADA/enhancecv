// Curevo AI — LinkedIn Profile Optimisation Workspace (Phase 9G)
//
// 100% Public, anonymous, zero-auth, truth-grounded profile optimizer.
// Features:
//   - Tab 1: Profile Input & Auto-fill from active Resume draft
//   - Tab 2: Scorecard & Gaps (7 transparent metrics + recruiter discoverability)
//   - Tab 3: AI Optimisation Hub (4 Headline alternatives, About section, XYZ bullets, keywords)
//   - Tab 4: Side-by-Side Before vs After Comparison
//   - Tab 5: History & JSON Export/Import

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Spinner } from '../components/ui';
import Navbar from '../components/Navbar';
import {
  getSavedLinkedInProfile,
  saveLinkedInProfile,
  getLinkedInHistory,
  saveLinkedInOptimization,
  deleteLinkedInOptimization,
  clearLinkedInHistory,
  exportLinkedInDataJson,
  importLinkedInDataJson,
  type LinkedInOptimizationRecord,
} from '../lib/linkedinStorage';
import type { ResumeData } from '../types';

type Tab = 'input' | 'scorecard' | 'optimizations' | 'compare' | 'history';

export default function LinkedIn() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'input';
  const [activeTab, setActiveTab] = useState<Tab>(
    ['input', 'scorecard', 'optimizations', 'compare', 'history'].includes(initialTab)
      ? initialTab
      : 'input'
  );

  // Resume Context
  const [activeResume, setActiveResume] = useState<ResumeData | null>(null);

  // Form Fields
  const [headline, setHeadline] = useState<string>('');
  const [about, setAbout] = useState<string>('');
  const [targetRole, setTargetRole] = useState<string>('');
  const [industry, setIndustry] = useState<string>('Technology');
  const [skillsInput, setSkillsInput] = useState<string>('');

  // Execution State
  const [loading, setLoading] = useState<boolean>(false);
  const [optimization, setOptimization] = useState<LinkedInOptimizationRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load saved profile and draft on mount
  useEffect(() => {
    // 1. Saved LinkedIn profile
    const saved = getSavedLinkedInProfile();
    if (saved) {
      setHeadline(saved.headline || '');
      setAbout(saved.about || '');
      setTargetRole(saved.targetRole || '');
      setIndustry(saved.industry || 'Technology');
      setSkillsInput(saved.skills ? saved.skills.join(', ') : '');
    }

    // 2. Active draft resume
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw =
          localStorage.getItem('curevo_builder_draft_v1_anonymous') ||
          localStorage.getItem('curevo_builder_draft_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.resume) {
            setActiveResume(parsed.resume);
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Most recent optimization run
    const history = getLinkedInHistory();
    if (history.length > 0 && !optimization) {
      setOptimization(history[0]);
    }
  }, []);

  const handleTabChange = (t: Tab) => {
    setActiveTab(t);
    setSearchParams((prev) => {
      prev.set('tab', t);
      return prev;
    });
  };

  // Auto-Fill from active Resume
  const handleAutoFillFromResume = () => {
    if (!activeResume) {
      showToast('No active CV draft found in browser storage.');
      return;
    }
    const newHeadline = activeResume.personal.headline || activeResume.experience[0]?.title || '';
    const newAbout = activeResume.summary || '';
    const newSkills = [
      ...activeResume.skills.technical,
      ...activeResume.skills.soft,
    ].slice(0, 15).join(', ');
    const newTargetRole = activeResume.personal.headline || activeResume.experience[0]?.title || '';

    setHeadline(newHeadline);
    setAbout(newAbout);
    setTargetRole(newTargetRole);
    setSkillsInput(newSkills);

    saveLinkedInProfile({
      headline: newHeadline,
      about: newAbout,
      targetRole: newTargetRole,
      skills: newSkills.split(',').map((s) => s.trim()).filter(Boolean),
    });

    showToast('Auto-filled profile from your active CV draft!');
  };

  const handleCopy = (text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast(`Copied ${label} to clipboard!`);
    }
  };

  const handleOptimize = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!headline.trim() && !about.trim() && !activeResume) {
      showToast('Please enter a headline, about section, or load from your CV draft.');
      return;
    }

    setLoading(true);
    const skillsArray = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    saveLinkedInProfile({
      headline,
      about,
      targetRole,
      industry,
      skills: skillsArray,
    });

    try {
      const res = await api.post<any>('/public/linkedin/optimize', {
        headline,
        about,
        targetRole,
        industry,
        skills: skillsArray,
        resume: activeResume,
      });

      if (res && res.scores) {
        const record: LinkedInOptimizationRecord = {
          id: `opt_${Date.now()}`,
          timestamp: new Date().toISOString(),
          headline,
          targetRole: targetRole || 'Professional',
          scores: res.scores,
          analysis: res.analysis,
          headlineOptions: res.headlineOptions,
          improvedAbout: res.improvedAbout,
          experienceEnhancements: res.experienceEnhancements,
          skillsRecommendations: res.skillsRecommendations,
          recruiterKeywords: res.recruiterKeywords,
          provider: res.provider || 'AI Engine',
          model: res.model || 'Curevo Model',
        };

        saveLinkedInOptimization(record);
        setOptimization(record);
        setActiveTab('scorecard');
        setSearchParams((prev) => {
          prev.set('tab', 'scorecard');
          return prev;
        });
        showToast('LinkedIn profile successfully analyzed and optimized!');
      }
    } catch (err: any) {
      showToast(err.message || 'Optimization request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* Header */}
      <Navbar ctaText="Prepare App" ctaLink="/prepare-application" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl flex items-center gap-2 border border-slate-800">
          <span className="text-teal-400">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 flex-1">
        {/* Banner */}
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-xs font-semibold tracking-wide uppercase text-blue-200">
                Truth Guard™ Recruiter Algorithm Optimization
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">LinkedIn Profile Optimization Workspace</h1>
            <p className="mt-1 text-sm text-blue-100">
              Transform your headline, About narrative, and recruiter keyword relevance with zero signup or account creation.
            </p>
          </div>

          {activeResume && (
            <button
              type="button"
              onClick={handleAutoFillFromResume}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-800/80 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white border border-blue-600 transition cursor-pointer"
            >
              <span>⚡</span>
              <span>Auto-Fill from Active CV</span>
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-6 overflow-x-auto">
          {[
            { id: 'input', label: '1. Profile Input' },
            { id: 'scorecard', label: '2. Analysis & Scorecard' },
            { id: 'optimizations', label: '3. AI Suggestions & Copy' },
            { id: 'compare', label: '4. Before vs After' },
            { id: 'history', label: '5. History & Export' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id as Tab)}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === t.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Profile Input */}
        {activeTab === 'input' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="text-lg font-bold text-slate-900">Your Current LinkedIn Information</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Paste your current headline and summary, or auto-fill directly from your CV draft.
              </p>

              <form onSubmit={handleOptimize} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                      Target Role
                    </label>
                    <input
                      type="text"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="e.g. Lead Software Engineer"
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                      Target Industry
                    </label>
                    <input
                      type="text"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g. Cloud Computing & FinTech"
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Current Headline
                    </label>
                    <span className="text-xs text-slate-400 font-mono">{headline.length}/220</span>
                  </div>
                  <input
                    type="text"
                    maxLength={220}
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Senior Software Engineer at Tech Corp | React, TypeScript, Cloud"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      About Section (Summary)
                    </label>
                    <span className="text-xs text-slate-400 font-mono">{about.length}/2600</span>
                  </div>
                  <textarea
                    rows={6}
                    maxLength={2600}
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    placeholder="Paste your current LinkedIn About summary..."
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Top Skills (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={skillsInput}
                    onChange={(e) => setSkillsInput(e.target.value)}
                    placeholder="e.g. TypeScript, React, Node.js, AWS, PostgreSQL, Distributed Systems"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {loading && <Spinner className="h-4 w-4 text-white" />}
                    <span>{loading ? 'Analyzing Profile & Recruiter Visibility...' : 'Optimize LinkedIn Profile'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: Scorecard & Gaps */}
        {activeTab === 'scorecard' && (
          <div className="space-y-6">
            {!optimization ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                <p>No optimization record yet. Please submit your profile details in Tab 1.</p>
              </div>
            ) : (
              <>
                {/* Score Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {[
                    { label: 'Overall', score: optimization.scores.overallScore, color: 'text-blue-600' },
                    { label: 'Headline', score: optimization.scores.headlineScore, color: 'text-emerald-600' },
                    { label: 'About', score: optimization.scores.aboutScore, color: 'text-teal-600' },
                    { label: 'Experience', score: optimization.scores.experienceScore, color: 'text-indigo-600' },
                    { label: 'Skills', score: optimization.scores.skillsScore, color: 'text-violet-600' },
                    { label: 'Searchability', score: optimization.scores.searchabilityScore, color: 'text-amber-600' },
                    { label: 'Completeness', score: optimization.scores.completenessScore, color: 'text-sky-600' },
                  ].map((s, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-2xs">
                      <span className="block text-2xs font-bold uppercase tracking-wider text-slate-500">
                        {s.label}
                      </span>
                      <span className={`text-2xl font-extrabold ${s.color}`}>{s.score}%</span>
                    </div>
                  ))}
                </div>

                {/* Analysis Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Strengths */}
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 block mb-2">
                      Key Strengths
                    </span>
                    <ul className="space-y-1.5 text-xs text-emerald-950">
                      {optimization.analysis.strengths.map((str, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-emerald-600">✓</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Areas of Improvement */}
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block mb-2">
                      Recruiter Gaps to Address
                    </span>
                    <ul className="space-y-1.5 text-xs text-amber-950">
                      {optimization.analysis.weaknesses.map((w, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-600">!</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Positioning Review */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">
                    Executive Positioning Review
                  </span>
                  <p className="text-sm text-slate-800 leading-relaxed">
                    {optimization.analysis.positioningReview}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {optimization.analysis.profileCompletenessFeedback}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 3: AI Optimisations Hub */}
        {activeTab === 'optimizations' && (
          <div className="space-y-6">
            {!optimization ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                <p>No optimization record yet. Please submit your profile details in Tab 1.</p>
              </div>
            ) : (
              <>
                {/* 1. Headline Alternatives */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">4 Optimized Headline Variations</h2>
                      <p className="text-xs text-slate-500">
                        Choose the style that matches your target seniority and recruiter keyword goals.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {optimization.headlineOptions.map((h, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between hover:border-blue-300 transition"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-2xs font-bold text-blue-800 uppercase">
                              {h.type}
                            </span>
                            <span className="text-2xs font-mono text-slate-400">{h.headline.length} chars</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 leading-snug">{h.headline}</p>
                          <p className="text-xs text-slate-500 mt-1.5 italic">{h.rationale}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(h.headline, `${h.type} Headline`)}
                          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                        >
                          <span>Copy Headline</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Copy-Ready About Section */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Copy-Ready About Section</h2>
                      <p className="text-xs text-slate-500">
                        Formatted in first-person narrative with compelling hooks and verifiable impact highlights.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(optimization.improvedAbout.text, 'About Section')}
                      className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
                    >
                      Copy Complete About
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                    {optimization.improvedAbout.text}
                  </div>
                </div>

                {/* 3. Recruiter Keywords to Target */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">High-Impact Recruiter Keywords</h2>
                    <p className="text-xs text-slate-500">
                      Keywords verified in your target role and industry to increase recruiter search indexing.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {optimization.recruiterKeywords.map((k, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900">{k.keyword}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-3xs font-bold uppercase ${
                                k.impactLevel === 'high'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {k.impactLevel}
                            </span>
                          </div>
                          <span className="text-3xs text-slate-500 uppercase tracking-wider block mb-1">
                            {k.category}
                          </span>
                          <p className="text-slate-600 text-2xs leading-snug">{k.relevanceExplanation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 4: Before vs After Comparison */}
        {activeTab === 'compare' && (
          <div className="space-y-6">
            {!optimization ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                <p>No optimization record yet. Please submit your profile details in Tab 1.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Original */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 uppercase">
                    Original Profile Input
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Headline:</span>
                    <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      {headline || '(No headline provided)'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase block mb-1">About Summary:</span>
                    <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-line">
                      {about || '(No About summary provided)'}
                    </p>
                  </div>
                </div>

                {/* Optimized */}
                <div className="rounded-2xl border border-blue-200 bg-blue-50/20 p-6 shadow-xs space-y-4">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 uppercase">
                    Optimized by Curevo AI
                  </span>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-blue-900 uppercase">Impact Headline:</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            optimization.headlineOptions[0]?.headline || '',
                            'Impact Headline'
                          )
                        }
                        className="text-2xs font-semibold text-blue-600 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-blue-950 bg-white p-3 rounded-lg border border-blue-200">
                      {optimization.headlineOptions[0]?.headline}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-blue-900 uppercase">Optimized About:</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(optimization.improvedAbout.text, 'Optimized About')
                        }
                        className="text-2xs font-semibold text-blue-600 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-sm text-slate-900 bg-white p-3 rounded-lg border border-blue-200 whitespace-pre-line leading-relaxed">
                      {optimization.improvedAbout.text}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: History & Export */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Optimization History & Backups</h2>
                  <p className="text-xs text-slate-500">
                    All data is persisted strictly in your local browser storage.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const json = exportLinkedInDataJson();
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `curevo_linkedin_backup_${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      showToast('Downloaded LinkedIn JSON backup!');
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Export JSON
                  </button>
                  <label className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                    Import JSON
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const content = event.target?.result as string;
                          const res = importLinkedInDataJson(content);
                          if (res.success) {
                            showToast(`Restored LinkedIn backup!`);
                            window.location.reload();
                          } else {
                            showToast(`Import error: ${res.error}`);
                          }
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Clear all local LinkedIn optimization history?')) {
                        clearLinkedInHistory();
                        setOptimization(null);
                        showToast('History cleared.');
                      }
                    }}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                  >
                    Clear History
                  </button>
                </div>
              </div>

              {/* History list */}
              {getLinkedInHistory().length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No previous optimizations recorded.
                </div>
              ) : (
                <div className="space-y-3">
                  {getLinkedInHistory().map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 hover:border-blue-300 transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{item.headline || 'Profile'}</span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-2xs font-bold text-blue-800">
                            {item.scores.overallScore}% Score
                          </span>
                        </div>
                        <span className="text-2xs text-slate-400">
                          {new Date(item.timestamp).toLocaleString()} • Target: {item.targetRole}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOptimization(item);
                            setActiveTab('scorecard');
                          }}
                          className="rounded-lg bg-white border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteLinkedInOptimization(item.id);
                            showToast('Deleted record.');
                          }}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
