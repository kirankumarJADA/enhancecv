import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import ResumeFormEditor from '../components/ResumeFormEditor';
import ResumePreview from '../components/ResumePreview';
import { ScoreBar, ScoreRing, Spinner, Modal } from '../components/ui';
import { useToast } from '../state/ToastContext';
import type { ATSAnalysis, ResumeData, MasterCvVersionSummary } from '../types';

interface MasterResponse {
  master: {
    id: string;
    title: string;
    content: ResumeData;
    revision: number;
    atsScore: number | null;
    completeness: number;
    updatedAt: string;
  } | null;
}

export default function MasterCVPage() {
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [masterId, setMasterId] = useState('');
  const [revision, setRevision] = useState<number>(1);
  const [ats, setAts] = useState<ATSAnalysis | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Version History State
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [versions, setVersions] = useState<MasterCvVersionSummary[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<MasterCvVersionSummary | null>(null);
  const [newSnapshotLabel, setNewSnapshotLabel] = useState('');
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  // Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const toast = useToast();

  const loadMasterCv = useCallback(async () => {
    try {
      const res = await api.get<MasterResponse>('/master');
      if (res.master) {
        setResume(res.master.content);
        setMasterId(res.master.id);
        setRevision(res.master.revision || 1);
        setConflictError(null);
        setDirty(false);
        const a = await api.get<{ analysis: ATSAnalysis }>('/master/ats');
        setAts(a.analysis);
      } else {
        setResume(null);
      }
    } catch {
      toast.show('Could not load your Master CV.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadMasterCv();
  }, [loadMasterCv]);

  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const res = await api.get<{ versions: MasterCvVersionSummary[] }>('/master/versions');
      setVersions(res.versions);
    } catch {
      toast.show('Could not load version history.', 'error');
    } finally {
      setLoadingVersions(false);
    }
  }, [toast]);

  const patch = useCallback((fn: (draft: ResumeData) => void) => {
    setResume((r) => {
      if (!r) return r;
      const draft = JSON.parse(JSON.stringify(r)) as ResumeData;
      fn(draft);
      return draft;
    });
    setDirty(true);
    setConflictError(null);
  }, []);

  async function save(createSnapshot = false, label = '') {
    if (!resume) return;
    setBusy(true);
    try {
      const res = await api.put<{ id: string; revision: number; atsScore: number }>('/master', {
        resume,
        title: 'Master CV',
        expectedRevision: revision,
        createSnapshot,
        versionLabel: label,
      });
      setMasterId(res.id);
      setRevision(res.revision);
      setDirty(false);
      setConflictError(null);
      const a = await api.get<{ analysis: ATSAnalysis }>('/master/ats');
      setAts(a.analysis);
      toast.show(`Saved Master CV (rev ${res.revision}) — ATS score ${res.atsScore}/100`, 'success');
      if (createSnapshot) {
        await loadVersions();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError('Conflict: Master CV was updated elsewhere. Reload to view the latest version.');
        toast.show('Revision conflict detected. Please reload.', 'error');
      } else {
        toast.show(err instanceof ApiError ? err.message : 'Could not save changes.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSnapshot() {
    if (!newSnapshotLabel.trim()) return;
    setCreatingSnapshot(true);
    try {
      await api.post('/master/versions', { label: newSnapshotLabel.trim() });
      setNewSnapshotLabel('');
      toast.show('Created version snapshot.', 'success');
      await loadVersions();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Failed to create snapshot.', 'error');
    } finally {
      setCreatingSnapshot(false);
    }
  }

  async function handleRestoreVersion(versionId: string) {
    setRestoringVersionId(versionId);
    try {
      const res = await api.post<{ master: { content: ResumeData; revision: number } }>(
        `/master/versions/${versionId}/restore`,
        {}
      );
      setResume(res.master.content);
      setRevision(res.master.revision);
      setDirty(false);
      setPreviewVersion(null);
      setVersionsModalOpen(false);
      toast.show(`Restored version as Revision ${res.master.revision}.`, 'success');
      const a = await api.get<{ analysis: ATSAnalysis }>('/master/ats');
      setAts(a.analysis);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Failed to restore version.', 'error');
    } finally {
      setRestoringVersionId(null);
    }
  }

  async function handleDeleteMasterCv() {
    if (deleteConfirmText.trim().toLowerCase() !== 'delete') return;
    setDeleting(true);
    try {
      await api.del('/master');
      toast.show('Master CV deleted successfully.', 'success');
      setDeleteModalOpen(false);
      setResume(null);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Failed to delete Master CV.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-8 w-8 text-ink-300" /></div>;
  }

  if (!resume) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-ink-900">No Master CV yet</h1>
        <p className="mt-2 text-sm text-ink-500">Your Master CV is your permanent source of truth. Create or import it to start tailoring.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a className="btn-primary" href="/builder?mode=create">Create in Builder</a>
          <a className="btn-secondary" href="/onboarding">Onboarding Wizard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {conflictError && (
        <div className="flex items-center justify-between rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠️ Concurrency Conflict:</span> {conflictError}
          </div>
          <button
            className="rounded-lg bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-800"
            onClick={() => void loadMasterCv()}
          >
            Reload Latest
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink-900">Master CV</h1>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
              Rev {revision}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                dirty ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {dirty ? '• Unsaved Edits' : '✓ Cloud Synced'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            Your permanent career profile. Job tailoring creates separate versions and never alters this original.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-secondary text-xs"
            onClick={() => {
              void loadVersions();
              setVersionsModalOpen(true);
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="mr-1.5 h-4 w-4 text-ink-500">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            Version History
          </button>

          <button
            className="btn-ghost text-xs text-red-600 hover:bg-red-50"
            onClick={() => {
              setDeleteConfirmText('');
              setDeleteModalOpen(true);
            }}
          >
            Delete Profile
          </button>

          <button
            className="btn-primary text-xs"
            onClick={() => void save()}
            disabled={busy || !dirty || Boolean(conflictError)}
          >
            {busy && <Spinner className="h-4 w-4" />} {dirty ? 'Save to Cloud' : 'Saved'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <ResumeFormEditor resume={resume} onChange={patch} />

        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">ATS Baseline Audit</h2>
              <span className="chip bg-brand-50 text-brand-700">Master Health</span>
            </div>
            {ats ? (
              <>
                <div className="mt-4 flex justify-center">
                  <ScoreRing score={ats.overallScore} size={110} label="out of 100" />
                </div>
                <div className="mt-5 space-y-3">
                  <ScoreBar label="Formatting" score={ats.formattingScore} />
                  <ScoreBar label="Structure" score={ats.structureScore} />
                  <ScoreBar label="Content" score={ats.contentScore} />
                  <ScoreBar label="Skills" score={ats.skillsScore} />
                  <ScoreBar label="Readability" score={ats.readabilityScore} />
                </div>
                <p className="mt-4 text-xs leading-relaxed text-ink-400">
                  {ats.metrics.bulletCount} bullets · {ats.metrics.technicalSkillCount} technical skills · ~{ats.metrics.estimatedPages} page(s)
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-500">Save your CV to see the baseline analysis.</p>
            )}
          </div>

          {ats && ats.issues.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink-900">Areas for Improvement</h2>
              <ul className="mt-3 space-y-3">
                {ats.issues.slice(0, 5).map((i) => (
                  <li key={i.message} className="text-sm">
                    <p className="font-medium text-ink-800">{i.message}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{i.recommendation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card overflow-hidden">
            <h2 className="px-5 pt-5 text-sm font-semibold text-ink-900">Live Preview</h2>
            <div className="mt-3 max-h-[60vh] overflow-y-auto bg-ink-100 p-4">
              <div style={{ zoom: 0.62 }}>
                <ResumePreview resume={resume} />
              </div>
            </div>
          </div>
          <input type="hidden" value={masterId} />
        </div>
      </div>

      {/* Version History Modal / Drawer */}
      <Modal open={versionsModalOpen} onClose={() => setVersionsModalOpen(false)} title="Master CV Version History">
        <div className="space-y-4">
          <p className="text-xs text-ink-500">
            Snapshots record immutable points in your career profile history. Restoring a snapshot creates a new revision without erasing history.
          </p>

          <div className="flex gap-2 rounded-xl border border-ink-100 bg-ink-50 p-2.5">
            <input
              type="text"
              className="input flex-1 text-xs"
              placeholder="Snapshot label (e.g. Q4 2026 Promotion)"
              value={newSnapshotLabel}
              onChange={(e) => setNewSnapshotLabel(e.target.value)}
            />
            <button
              className="btn-primary text-xs"
              disabled={creatingSnapshot || !newSnapshotLabel.trim()}
              onClick={() => void handleCreateSnapshot()}
            >
              {creatingSnapshot ? 'Saving…' : 'Create Snapshot'}
            </button>
          </div>

          {loadingVersions ? (
            <div className="flex justify-center py-6"><Spinner className="h-6 w-6 text-ink-300" /></div>
          ) : versions.length === 0 ? (
            <p className="py-4 text-center text-xs text-ink-400">No version snapshots yet.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-xs hover:bg-ink-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-900">v{v.versionNumber}: {v.versionLabel}</span>
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600 uppercase">
                        {v.source}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost px-2 py-1 text-xs text-brand-600 hover:bg-brand-50"
                      onClick={() => setPreviewVersion(v)}
                    >
                      Preview
                    </button>
                    <button
                      className="btn-secondary px-2 py-1 text-xs"
                      disabled={restoringVersionId === v.id}
                      onClick={() => void handleRestoreVersion(v.id)}
                    >
                      {restoringVersionId === v.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Snapshot Preview Modal */}
      <Modal open={!!previewVersion} onClose={() => setPreviewVersion(null)} title={`Preview Snapshot: ${previewVersion?.versionLabel || ''}`}>
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            Version {previewVersion?.versionNumber} snapshot taken on {previewVersion ? new Date(previewVersion.createdAt).toLocaleString() : ''}.
          </p>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-ink-200 bg-ink-100 p-4">
            {previewVersion?.contentSnapshot && (
              <div style={{ zoom: 0.65 }}>
                <ResumePreview resume={previewVersion.contentSnapshot} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary text-xs" onClick={() => setPreviewVersion(null)}>
              Close
            </button>
            {previewVersion && (
              <button
                className="btn-primary text-xs"
                disabled={restoringVersionId === previewVersion.id}
                onClick={() => void handleRestoreVersion(previewVersion.id)}
              >
                Restore This Snapshot
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Safe Delete Master CV Confirmation Modal */}
      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Master CV">
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-800">
            <strong>Warning:</strong> Deleting your Master CV removes your permanent source of truth and all historical version snapshots. Tailored resumes will remain preserved.
          </div>
          <p className="text-xs text-ink-600">
            To confirm deletion, please type <strong>DELETE</strong> below:
          </p>
          <input
            type="text"
            className="input w-full text-xs"
            placeholder="Type DELETE"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary text-xs" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary bg-red-600 text-xs hover:bg-red-700"
              disabled={deleting || deleteConfirmText.trim().toLowerCase() !== 'delete'}
              onClick={() => void handleDeleteMasterCv()}
            >
              {deleting ? 'Deleting…' : 'Permanently Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
