import React, { useState } from 'react';
import type { AdvancedAtsAudit, ATSAnalysis, AuditDimensionKey, AuditFinding } from '../types';

interface AdvancedAtsAuditViewProps {
  audit: AdvancedAtsAudit;
  legacyAts?: ATSAnalysis;
}

const DIMENSION_ICONS: Record<AuditDimensionKey, string> = {
  parsing: '📄',
  quantification: '📊',
  repetition: '🔄',
  spelling: '✍️',
  consistency: '📏',
  sections: '📑',
  essentials: '🎯',
  recruiter: '👀',
  inclusivity: '🤝',
};

export const AdvancedAtsAuditView: React.FC<AdvancedAtsAuditViewProps> = ({ audit, legacyAts }) => {
  const [selectedDimension, setSelectedDimension] = useState<AuditDimensionKey | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info' | 'positive'>('all');
  const [showLegacyChecklist, setShowLegacyChecklist] = useState<boolean>(false);

  // Filter findings based on selected dimension & severity
  const filteredFindings = audit.allFindings.filter((finding) => {
    if (selectedDimension !== 'all' && finding.dimension !== selectedDimension) {
      return false;
    }
    if (severityFilter !== 'all' && finding.severity !== severityFilter) {
      return false;
    }
    return true;
  });

  const ratingBadges: Record<AdvancedAtsAudit['rating'], { label: string; className: string }> = {
    exceptional: {
      label: 'Exceptional — Top Tier Readiness',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200 ring-1 ring-emerald-300',
    },
    competitive: {
      label: 'Competitive Candidate Profile',
      className: 'bg-teal-50 text-teal-800 border-teal-200 ring-1 ring-teal-300',
    },
    moderate: {
      label: 'Moderate — Optimization Recommended',
      className: 'bg-amber-50 text-amber-800 border-amber-200 ring-1 ring-amber-300',
    },
    needs_work: {
      label: 'Needs Optimization Before Applying',
      className: 'bg-rose-50 text-rose-800 border-rose-200 ring-1 ring-rose-300',
    },
  };

  const currentBadge = ratingBadges[audit.rating] || ratingBadges.competitive;

  return (
    <div className="space-y-6">
      {/* 1. Header Composite Score & Overview Card */}
      <div className="card p-6 bg-white border-slate-200 shadow-sm rounded-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-5">
            {/* Circular Gauge */}
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth="8"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="transparent"
                  stroke={
                    audit.overallScore >= 80
                      ? '#059669'
                      : audit.overallScore >= 65
                      ? '#0d9488'
                      : audit.overallScore >= 50
                      ? '#d97706'
                      : '#e11d48'
                  }
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - audit.overallScore / 100)}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none">
                  {audit.overallScore}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">out of 100</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900">Advanced ATS Audit</h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${currentBadge.className}`}>
                  {currentBadge.label}
                </span>
              </div>
              <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">{audit.summary}</p>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">Quantified</span>
              <span className="text-base font-bold text-slate-800">
                {audit.stats.quantifiedPercentage}%
              </span>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                {audit.stats.quantifiedBullets}/{audit.stats.totalBullets} bullets
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">Action Verbs</span>
              <span className="text-base font-bold text-slate-800">
                {audit.stats.actionVerbPercentage}%
              </span>
              <span className="block text-[10px] text-slate-400 mt-0.5">strong openers</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">Avg Length</span>
              <span className="text-base font-bold text-slate-800">
                {audit.stats.avgBulletWordCount}w
              </span>
              <span className="block text-[10px] text-slate-400 mt-0.5">sweet spot: 8–30w</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <span className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider">Read Time</span>
              <span className="text-base font-bold text-slate-800">
                ~{audit.stats.readingTimeSeconds}s
              </span>
              <span className="block text-[10px] text-slate-400 mt-0.5">recruiter scan</span>
            </div>
          </div>
        </div>

        {/* 2. Priority Quick Wins Banner (if any high-impact issues) */}
        {audit.quickWins.length > 0 && (
          <div className="mt-5 p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-900 text-xs font-bold">
                ⚡
              </span>
              <h4 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                High-Leverage Quick Wins ({audit.quickWins.length})
              </h4>
              <span className="text-xs text-amber-800/80 font-normal">
                Resolving these items will deliver the fastest score gain.
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {audit.quickWins.map((win) => (
                <div
                  key={win.id}
                  className="p-3 bg-white/90 border border-amber-200 rounded-lg text-xs space-y-1 shadow-2xs hover:border-amber-300 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{win.title}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {win.severity}
                    </span>
                  </div>
                  <p className="text-slate-600 line-clamp-2">{win.recommendation || win.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. 9 Dimensions Explorer Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Evaluation Across 9 ATS Dimensions
          </h4>
          {selectedDimension !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedDimension('all')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-900 transition flex items-center gap-1"
            >
              <span>✕</span> Reset to view all dimensions
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(audit.dimensions) as AuditDimensionKey[]).map((dimKey) => {
            const dim = audit.dimensions[dimKey];
            const isSelected = selectedDimension === dimKey;
            const barColor =
              dim.score >= 85
                ? 'bg-emerald-500'
                : dim.score >= 70
                ? 'bg-teal-500'
                : dim.score >= 50
                ? 'bg-amber-500'
                : 'bg-rose-500';

            return (
              <button
                key={dimKey}
                type="button"
                onClick={() => setSelectedDimension(isSelected ? 'all' : dimKey)}
                className={`text-left p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-800'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs text-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-tight">
                      <span>{DIMENSION_ICONS[dimKey]}</span>
                      <span className={isSelected ? 'text-white' : 'text-slate-900'}>{dim.label}</span>
                    </span>
                    <span
                      className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-slate-800 text-teal-300'
                          : dim.score >= 80
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : dim.score >= 60
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {dim.score}/100
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${dim.score}%`, transition: 'width 0.5s ease' }}
                    />
                  </div>

                  <p
                    className={`text-[11px] line-clamp-2 leading-relaxed ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {dim.summary}
                  </p>
                </div>

                <div
                  className={`mt-3 pt-2 border-t flex items-center justify-between text-[11px] ${
                    isSelected ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-400'
                  }`}
                >
                  <span>Weight: {dim.weight}%</span>
                  <span className="font-medium">
                    {dim.findings.length} item{dim.findings.length === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Detailed Findings Section */}
      <div className="card p-6 bg-white border-slate-200 shadow-sm rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-base font-bold text-slate-900">
              Audit Findings &amp; Evidence
              {selectedDimension !== 'all' && (
                <span className="ml-2 text-xs font-semibold text-teal-700">
                  ({audit.dimensions[selectedDimension].label})
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Specific citations, actionable guidance, and rule citations for every finding.
            </p>
          </div>

          {/* Severity Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${audit.allFindings.length})` },
                { id: 'critical', label: `Critical (${audit.stats.criticalCount})` },
                { id: 'warning', label: `Warnings (${audit.stats.warningCount})` },
                { id: 'info', label: `Suggestions (${audit.stats.infoCount})` },
                { id: 'positive', label: `Passed (${audit.stats.positiveCount})` },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSeverityFilter(filter.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                  severityFilter === filter.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Findings List */}
        <div className="space-y-3">
          {filteredFindings.length > 0 ? (
            filteredFindings.map((finding) => {
              const severityStyles: Record<AuditFinding['severity'], { badge: string; bg: string; icon: string }> = {
                critical: {
                  badge: 'bg-rose-100 text-rose-800 border-rose-200',
                  bg: 'border-l-4 border-l-rose-500 bg-rose-50/20 border-slate-200',
                  icon: '⚠️',
                },
                warning: {
                  badge: 'bg-amber-100 text-amber-800 border-amber-200',
                  bg: 'border-l-4 border-l-amber-500 bg-amber-50/15 border-slate-200',
                  icon: '⚡',
                },
                info: {
                  badge: 'bg-sky-100 text-sky-800 border-sky-200',
                  bg: 'border-l-4 border-l-sky-500 bg-sky-50/15 border-slate-200',
                  icon: '💡',
                },
                positive: {
                  badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                  bg: 'border-l-4 border-l-emerald-500 bg-emerald-50/15 border-slate-200',
                  icon: '✓',
                },
              };

              const style = severityStyles[finding.severity];

              return (
                <div
                  key={finding.id}
                  className={`p-4 rounded-xl border ${style.bg} space-y-2 transition hover:shadow-2xs`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{style.icon}</span>
                      <h5 className="text-sm font-bold text-slate-900">{finding.title}</h5>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${style.badge}`}>
                        {finding.severity}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {DIMENSION_ICONS[finding.dimension]} {audit.dimensions[finding.dimension]?.label || finding.dimension}
                      </span>
                      {finding.location && (
                        <span className="hidden sm:inline font-mono text-slate-400">
                          {finding.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{finding.message}</p>

                  {/* Evidence / Citation Snippet */}
                  {finding.evidence && (
                    <div className="p-2.5 rounded-lg bg-slate-100/80 border border-slate-200/80 font-mono text-[11px] text-slate-800 break-words">
                      <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block mb-1">
                        CITED EVIDENCE:
                      </span>
                      &quot;{finding.evidence}&quot;
                    </div>
                  )}

                  {/* Concrete Suggestion Replacement */}
                  {finding.suggestion && (
                    <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200 text-xs text-teal-900 font-medium">
                      <span className="font-bold text-teal-950">Recommended Adjustment:</span> {finding.suggestion}
                    </div>
                  )}

                  {/* Actionable Recommendation */}
                  {finding.recommendation && (
                    <div className="text-xs text-slate-600 flex items-start gap-1.5 pt-1">
                      <span className="text-teal-600 font-bold">Action:</span>
                      <span>{finding.recommendation}</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-500">
              <p className="text-sm font-medium">No findings match the current filter selection.</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedDimension('all');
                  setSeverityFilter('all');
                }}
                className="mt-2 text-xs font-semibold text-teal-700 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. Strengths & Verified Assets Showcase */}
      {audit.strengths.length > 0 && (
        <div className="card p-6 bg-linear-to-br from-emerald-50/50 to-teal-50/30 border-emerald-200 shadow-2xs rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-700 font-bold text-sm">✓</span>
            <h4 className="text-sm font-bold text-emerald-950 uppercase tracking-wide">
              Verified Candidate Strengths ({audit.strengths.length})
            </h4>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {audit.strengths.map((str) => (
              <div
                key={str.id}
                className="p-3 bg-white/90 border border-emerald-200 rounded-lg text-xs space-y-1 shadow-2xs"
              >
                <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <span className="text-emerald-600">•</span>
                  <span>{str.title}</span>
                </div>
                <p className="text-slate-600 leading-relaxed">{str.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Legacy ATS Checklist Disclosure (Optional Accordion) */}
      {legacyAts && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setShowLegacyChecklist((prev) => !prev)}
            className="w-full px-5 py-3.5 bg-slate-50 text-left flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
          >
            <span className="flex items-center gap-2">
              <span>📋</span>
              <span>Legacy 22-Rule ATS Checklist &amp; Category Scores ({legacyAts.overallScore}/100)</span>
            </span>
            <span className="text-slate-400 text-sm">{showLegacyChecklist ? '▲ Hide' : '▼ View Details'}</span>
          </button>

          {showLegacyChecklist && (
            <div className="p-5 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Formatting</span>
                  <span className="text-sm font-bold text-slate-800">{legacyAts.formattingScore}%</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Content</span>
                  <span className="text-sm font-bold text-slate-800">{legacyAts.contentScore}%</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Structure</span>
                  <span className="text-sm font-bold text-slate-800">{legacyAts.structureScore}%</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Skills</span>
                  <span className="text-sm font-bold text-slate-800">{legacyAts.skillsScore}%</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Readability</span>
                  <span className="text-sm font-bold text-slate-800">{legacyAts.readabilityScore}%</span>
                </div>
              </div>

              {legacyAts.checks && (
                <div className="space-y-1.5 text-xs max-h-60 overflow-y-auto pr-1">
                  {legacyAts.checks.map((chk) => (
                    <div
                      key={chk.id}
                      className={`flex items-center justify-between p-2 rounded border ${
                        chk.passed
                          ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                          : chk.skipped
                          ? 'bg-slate-50 border-slate-200 text-slate-500'
                          : 'bg-rose-50/50 border-rose-100 text-rose-900'
                      }`}
                    >
                      <span className="font-medium">
                        {chk.passed ? '✓' : chk.skipped ? '–' : '✕'} {chk.message}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {chk.category} • {chk.weight}pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedAtsAuditView;
