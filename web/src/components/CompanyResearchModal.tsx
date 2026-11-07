// Curevo AI — Company Research Modal Component (Phase 9H)
//
// 100% Public, truth-grounded company intelligence viewer.
// Sourced from verified search results or verified curated benchmarks.

import { useState, useEffect } from 'react';
import { api } from '../api';
import { Spinner } from './ui';
import {
  getCompanyResearch,
  saveCompanyResearch,
  type CompanyResearchData,
} from '../lib/companyResearchStorage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  jobDescription?: string;
  onSelectForInterview?: (company: string) => void;
}

export default function CompanyResearchModal({
  isOpen,
  onClose,
  companyName,
  jobDescription,
  onSelectForInterview,
}: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<CompanyResearchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !companyName) return;

    setError(null);
    const cached = getCompanyResearch(companyName);
    if (cached) {
      setData(cached);
      return;
    }

    // Fetch from public API
    setLoading(true);
    api
      .post<{ ok: boolean; research: CompanyResearchData }>('/public/company-research', {
        company: companyName,
        jobDescription,
      })
      .then((res) => {
        if (res && res.research) {
          setData(res.research);
          saveCompanyResearch(res.research);
        }
      })
      .catch((err) => {
        setError(
          err.message ||
            'Company research requires a configured search provider. External facts cannot be fabricated.'
        );
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, companyName, jobDescription]);

  if (!isOpen) return null;

  const handleCopy = (text: string, idx: number) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-lg">
              🏢
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{companyName}</h2>
                {data && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-3xs font-bold uppercase tracking-wider ${
                      data.isCuratedBenchmark
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {data.isCuratedBenchmark ? 'Curated Benchmark' : 'Verified Web Intelligence'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {data?.industry || 'Evidence-grounded intelligence for candidate preparation'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {loading && (
            <div className="py-16 text-center space-y-3">
              <Spinner className="h-8 w-8 text-blue-600 mx-auto" />
              <p className="text-sm font-medium text-slate-600">
                Retrieving verified company research and recent developments...
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <span>⚠️</span>
                <span>Live Web Research Unavailable</span>
              </div>
              <p className="text-xs leading-relaxed">{error}</p>
              <p className="text-2xs text-amber-800">
                Curevo AI never fabricates company details without verifiable external sources.
              </p>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Overview */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Company Overview
                </h3>
                <p className="text-sm leading-relaxed text-slate-700">{data.overview}</p>
                {data.businessModel && (
                  <p className="text-xs text-slate-500 mt-2 italic">
                    <strong className="text-slate-700 font-semibold not-italic">Business Model:</strong>{' '}
                    {data.businessModel}
                  </p>
                )}
              </div>

              {/* Technologies */}
              {data.technologies && data.technologies.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Verified Technologies & Stack
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {data.technologies.map((tech, idx) => (
                      <span
                        key={idx}
                        className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Products & Services */}
              {data.productsServices && data.productsServices.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Key Products & Core Services
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {data.productsServices.map((prod, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>{prod}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recent Developments with Source URLs */}
              {data.recentDevelopments && data.recentDevelopments.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Recent Verified Developments (with Source URLs)
                  </h3>
                  <div className="space-y-2.5">
                    {data.recentDevelopments.map((dev, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{dev.title}</span>
                          <span className="text-3xs text-slate-400 font-mono">{dev.retrievalDate}</span>
                        </div>
                        <p className="text-slate-600 leading-snug">{dev.fact}</p>
                        <a
                          href={dev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-2xs font-semibold text-blue-600 hover:underline pt-0.5"
                        >
                          <span>Source: {dev.sourceUrl}</span>
                          <span>↗</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Interviewer Questions */}
              {data.suggestedInterviewerQuestions && data.suggestedInterviewerQuestions.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Smart Questions to Ask the Interviewer
                  </h3>
                  <div className="space-y-2">
                    {data.suggestedInterviewerQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs"
                      >
                        <span className="text-blue-950 font-medium leading-relaxed pr-3">{q}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(q, idx)}
                          className="shrink-0 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-2xs font-semibold text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                        >
                          {copiedIndex === idx ? 'Copied ✓' : 'Copy'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 bg-slate-50 flex items-center justify-between">
          <span className="text-2xs text-slate-400">
            {data?.retrievalDate ? `Intelligence verified as of ${data.retrievalDate}` : 'Truth Guard Protected'}
          </span>
          <div className="flex items-center gap-2">
            {onSelectForInterview && data && (
              <button
                type="button"
                onClick={() => {
                  onSelectForInterview(companyName);
                  onClose();
                }}
                className="rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
              >
                Prepare Interview for {companyName}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
