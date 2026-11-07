// Curevo AI — Public Kanban Application Dashboard (Phase 9E)
//
// 100% Public, Free, and Login-Free.
// Features:
//   - Kanban board with 5 stages: SAVED, APPLIED, INTERVIEW, OFFER, REJECTED
//   - Drag / 1-click status transitions
//   - Quick add application, full modal editing, and deletion
//   - 1-click CSV & JSON export
//   - Match score integration and 1-click CV tailoring
//   - Local Storage persistence with zero account requirement

import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import CompanyResearchModal from '../components/CompanyResearchModal';
import {
  getApplications,
  saveApplication,
  updateApplicationStatus,
  deleteApplication,
  exportApplicationsCsv,
  exportApplicationsJson,
  type TrackedApplication,
  type ApplicationStage,
} from '../lib/jobStorage';

const STAGES: { key: ApplicationStage; label: string; color: string; badge: string; icon: string }[] = [
  { key: 'SAVED', label: 'Wishlist / Saved', color: 'border-slate-300 bg-slate-100/70', badge: 'bg-slate-200 text-slate-800', icon: '☆' },
  { key: 'APPLIED', label: 'Applied', color: 'border-blue-300 bg-blue-50/50', badge: 'bg-blue-100 text-blue-800', icon: '📨' },
  { key: 'INTERVIEW', label: 'Interviewing', color: 'border-amber-300 bg-amber-50/50', badge: 'bg-amber-100 text-amber-800', icon: '🗓' },
  { key: 'OFFER', label: 'Offer Received', color: 'border-emerald-300 bg-emerald-50/50', badge: 'bg-emerald-100 text-emerald-800', icon: '🎉' },
  { key: 'REJECTED', label: 'Archived / Rejected', color: 'border-rose-200 bg-rose-50/40', badge: 'bg-rose-100 text-rose-800', icon: '📦' },
];

export default function Applications() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<TrackedApplication[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeMobileStage, setActiveMobileStage] = useState<ApplicationStage>('APPLIED');

  // Modals & Forms
  const [editingApp, setEditingApp] = useState<TrackedApplication | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [formCompany, setFormCompany] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formLocation, setFormLocation] = useState('Remote');
  const [formSalary, setFormSalary] = useState('');
  const [formStatus, setFormStatus] = useState<ApplicationStage>('APPLIED');
  const [formAppliedDate, setFormAppliedDate] = useState('');
  const [formInterviewDate, setFormInterviewDate] = useState('');
  const [formJobUrl, setFormJobUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [researchCompany, setResearchCompany] = useState<string | null>(null);

  const loadData = () => {
    const list = getApplications();
    setApplications(list);
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Summary Metrics
  const metrics = useMemo(() => {
    const counts: Record<ApplicationStage, number> = {
      SAVED: 0,
      APPLIED: 0,
      INTERVIEW: 0,
      OFFER: 0,
      REJECTED: 0,
    };
    applications.forEach((a) => {
      if (counts[a.status] !== undefined) {
        counts[a.status]++;
      }
    });
    return {
      total: applications.length,
      ...counts,
    };
  }, [applications]);

  // Filtered applications
  const filteredApps = useMemo(() => {
    if (!searchFilter.trim()) return applications;
    const q = searchFilter.toLowerCase().trim();
    return applications.filter(
      (a) =>
        a.company.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        (a.notes && a.notes.toLowerCase().includes(q))
    );
  }, [applications, searchFilter]);

  // Handle stage change
  const handleStageChange = (id: string, newStage: ApplicationStage) => {
    const success = updateApplicationStatus(id, newStage);
    if (success) {
      loadData();
      triggerToast(`Moved application to ${newStage}`);
    }
  };

  // Handle delete
  const handleDelete = (id: string, role: string) => {
    if (window.confirm(`Delete application for "${role}"?`)) {
      deleteApplication(id);
      loadData();
      triggerToast('Application removed');
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormCompany('');
    setFormRole('');
    setFormLocation('Remote');
    setFormSalary('');
    setFormStatus('APPLIED');
    setFormAppliedDate(today);
    setFormInterviewDate('');
    setFormJobUrl('');
    setFormNotes('');
    setIsCreating(true);
  };

  // Open Edit Modal
  const openEditModal = (app: TrackedApplication) => {
    setEditingApp(app);
    setFormCompany(app.company);
    setFormRole(app.role);
    setFormLocation(app.location || '');
    setFormSalary(app.salary || '');
    setFormStatus(app.status);
    setFormAppliedDate(app.applied_date || '');
    setFormInterviewDate(app.interview_date || '');
    setFormJobUrl(app.job_url || '');
    setFormNotes(app.notes || '');
  };

  // Submit Create or Edit Form
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompany.trim() || !formRole.trim()) {
      triggerToast('Company and Role Title are required.');
      return;
    }

    const now = new Date().toISOString();
    if (editingApp) {
      const updated: TrackedApplication = {
        ...editingApp,
        company: formCompany.trim(),
        role: formRole.trim(),
        location: formLocation.trim(),
        salary: formSalary.trim(),
        status: formStatus,
        applied_date: formAppliedDate,
        interview_date: formInterviewDate || undefined,
        job_url: formJobUrl.trim(),
        notes: formNotes.trim(),
        updated_at: now,
      };
      saveApplication(updated);
      setEditingApp(null);
      triggerToast(`Updated "${updated.role}" application!`);
    } else {
      const newApp: TrackedApplication = {
        id: `app_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        company: formCompany.trim(),
        role: formRole.trim(),
        location: formLocation.trim(),
        salary: formSalary.trim(),
        status: formStatus,
        applied_date: formAppliedDate || (formStatus === 'APPLIED' ? now.split('T')[0] : ''),
        interview_date: formInterviewDate || undefined,
        job_url: formJobUrl.trim(),
        notes: formNotes.trim(),
        created_at: now,
        updated_at: now,
      };
      saveApplication(newApp);
      setIsCreating(false);
      triggerToast(`Added "${newApp.role}" to your tracker!`);
    }
    loadData();
  };

  // Tailor Resume for this Application
  const handleTailor = (app: TrackedApplication) => {
    const text = `${app.role} at ${app.company}\nLocation: ${app.location}\n${app.notes ? `Notes:\n${app.notes}\n` : ''}${
      app.job_description ? `Description:\n${app.job_description}` : ''
    }`;
    try {
      sessionStorage.setItem('curevo_prefilled_jd', text);
      sessionStorage.setItem('curevo_prefilled_role', app.role);
      sessionStorage.setItem('curevo_prefilled_company', app.company);
    } catch {
      // ignore
    }
    navigate('/builder?mode=improve');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* Top Header */}
      <Navbar ctaText="Find Jobs" ctaLink="/jobs" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl flex items-center gap-2 border border-slate-800 animate-fade-in">
          <span className="text-teal-400">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Dashboard Area */}
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 flex-1 flex flex-col">
        {/* Dashboard Top Banner */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application Kanban Board</h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Track your job pipeline across 5 stages with local persistence, match insights, and CSV/JSON exports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportApplicationsCsv}
              disabled={applications.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
              title="Download spreadsheet of your applications"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={exportApplicationsJson}
              disabled={applications.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
              title="Download complete JSON backup"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-teal-700 shadow-xs transition cursor-pointer"
            >
              + Add Application
            </button>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Total Tracked</span>
            <p className="text-xl font-extrabold text-slate-900 mt-0.5">{metrics.total}</p>
          </div>
          {STAGES.map((s) => (
            <div key={s.key} className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">{s.label}</span>
                <span className="text-xs">{s.icon}</span>
              </div>
              <p className="text-xl font-extrabold text-slate-900 mt-0.5">{metrics[s.key]}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by company, role or notes..."
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:text-sm bg-white focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Mobile stage selector tabs */}
          <div className="flex sm:hidden w-full overflow-x-auto gap-1 pb-1">
            {STAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveMobileStage(s.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  activeMobileStage === s.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {s.label} ({metrics[s.key]})
              </button>
            ))}
          </div>
        </div>

        {/* Kanban Board Container */}
        {applications.length === 0 ? (
          <div className="flex-1 rounded-2xl border border-dashed border-slate-300 p-12 text-center bg-white flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 text-2xl mb-3">
              📋
            </div>
            <h3 className="text-lg font-bold text-slate-900">Your Application Board is Empty</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-md">
              Start tracking your job search! Add applications manually or discover curated benchmark jobs and track them with one click.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                + Add First Application
              </button>
              <Link
                to="/jobs"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Find Jobs to Track
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            {/* Desktop Kanban Grid (5 Columns) */}
            <div className="hidden sm:grid sm:grid-cols-5 gap-3.5 items-start">
              {STAGES.map((col) => {
                const stageApps = filteredApps.filter((a) => a.status === col.key);

                return (
                  <div
                    key={col.key}
                    className={`rounded-2xl border p-3 flex flex-col min-h-[550px] ${col.color}`}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{col.icon}</span>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          {col.label}
                        </h2>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${col.badge}`}>
                        {stageApps.length}
                      </span>
                    </div>

                    {/* Cards List */}
                    <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh] pr-0.5">
                      {stageApps.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs">
                          No {col.label.toLowerCase()} roles
                        </div>
                      ) : (
                        stageApps.map((app) => (
                          <div
                            key={app.id}
                            className="rounded-xl bg-white p-3.5 shadow-2xs border border-slate-200 hover:border-slate-300 transition flex flex-col justify-between group"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-1.5">
                                <span className="text-[11px] font-bold text-teal-700 uppercase line-clamp-1">
                                  {app.company}
                                </span>
                                {app.match_score !== null && app.match_score !== undefined && (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shrink-0">
                                    {app.match_score}%
                                  </span>
                                )}
                              </div>
                              <h3 className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">{app.role}</h3>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {[app.location, app.salary].filter(Boolean).join(' • ')}
                              </p>

                              {/* Dates indicator */}
                              <div className="mt-2 text-[10px] text-slate-400 space-y-0.5">
                                {app.applied_date && (
                                  <p>Applied: <span className="text-slate-600">{app.applied_date}</span></p>
                                )}
                                {app.interview_date && (
                                  <p className="text-amber-700 font-semibold">
                                    Interview: {app.interview_date}
                                  </p>
                                )}
                              </div>

                              {/* Notes snippet */}
                              {app.notes && (
                                <p className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2">
                                  {app.notes}
                                </p>
                              )}
                            </div>

                            {/* Card Stage Movement Dropdown & Actions */}
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                              {/* Move Stage Selector */}
                              <select
                                value={app.status}
                                onChange={(e) => handleStageChange(app.id, e.target.value as ApplicationStage)}
                                className="text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-700 font-medium focus:outline-none"
                              >
                                {STAGES.map((s) => (
                                  <option key={s.key} value={s.key}>
                                    Move: {s.label}
                                  </option>
                                ))}
                              </select>

                              {/* Action buttons */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setResearchCompany(app.company)}
                                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 p-1"
                                  title="Research company intelligence"
                                >
                                  Research
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigate(`/interview?role=${encodeURIComponent(app.role)}&company=${encodeURIComponent(app.company)}&jd=${encodeURIComponent(app.job_description || '')}&tab=prepare`);
                                  }}
                                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 p-1"
                                  title="Prepare interview for this application"
                                >
                                  Interview
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTailor(app)}
                                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 p-1"
                                  title="Tailor resume for this application"
                                >
                                  Tailor
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(app)}
                                  className="text-[11px] text-slate-500 hover:text-slate-800 p-1"
                                  title="Edit details"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(app.id, app.role)}
                                  className="text-[11px] text-rose-500 hover:text-rose-700 p-1"
                                  title="Delete"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile View: Active Stage Column */}
            <div className="block sm:hidden space-y-3">
              {filteredApps
                .filter((a) => a.status === activeMobileStage)
                .map((app) => (
                  <div key={app.id} className="rounded-xl bg-white p-4 border border-slate-200 shadow-2xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold text-teal-700 uppercase">{app.company}</span>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5">{app.role}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {[app.location, app.salary, app.applied_date && `Applied: ${app.applied_date}`]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      </div>
                      {app.match_score !== null && app.match_score !== undefined && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                          {app.match_score}%
                        </span>
                      )}
                    </div>

                    {app.notes && (
                      <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">{app.notes}</p>
                    )}

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <select
                        value={app.status}
                        onChange={(e) => handleStageChange(app.id, e.target.value as ApplicationStage)}
                        className="text-xs bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 font-semibold"
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            Stage: {s.label}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setResearchCompany(app.company)}
                          className="text-xs font-bold text-blue-700"
                        >
                          Research
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTailor(app)}
                          className="text-xs font-bold text-teal-700"
                        >
                          Tailor CV
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(app)}
                          className="text-xs text-slate-600"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(app.id, app.role)}
                          className="text-xs text-rose-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              {filteredApps.filter((a) => a.status === activeMobileStage).length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
                  No applications in this stage.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal: Add or Edit Application */}
        {(isCreating || editingApp) && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
          >
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingApp ? 'Edit Application' : 'Add New Application'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingApp(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveForm} className="mt-4 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Company *</label>
                    <input
                      type="text"
                      required
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value)}
                      placeholder="e.g. Google, Datadog"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Role Title *</label>
                    <input
                      type="text"
                      required
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Status Stage</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as ApplicationStage)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none bg-white font-medium"
                    >
                      {STAGES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Location</label>
                    <input
                      type="text"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      placeholder="e.g. London / Remote"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Applied Date</label>
                    <input
                      type="date"
                      value={formAppliedDate}
                      onChange={(e) => setFormAppliedDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Interview Date (optional)</label>
                    <input
                      type="date"
                      value={formInterviewDate}
                      onChange={(e) => setFormInterviewDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Salary / Compensation</label>
                    <input
                      type="text"
                      value={formSalary}
                      onChange={(e) => setFormSalary(e.target.value)}
                      placeholder="e.g. £90k - £110k"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 uppercase mb-1">Job URL</label>
                    <input
                      type="url"
                      value={formJobUrl}
                      onChange={(e) => setFormJobUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Notes & Follow-ups</label>
                  <textarea
                    rows={3}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Key contacts, referral info, interview round details, preparation points..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-teal-500 focus:outline-none leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setEditingApp(null);
                    }}
                    className="rounded-lg border border-slate-300 px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700 transition cursor-pointer"
                  >
                    {editingApp ? 'Save Changes' : 'Create Application'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Company Research Intelligence Modal */}
        <CompanyResearchModal
          isOpen={!!researchCompany}
          onClose={() => setResearchCompany(null)}
          companyName={researchCompany || ''}
          onSelectForInterview={(comp) => {
            navigate(`/interview?tab=prepare&company=${encodeURIComponent(comp)}`);
          }}
        />
      </main>
    </div>
  );
}
