import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useToast } from '../state/ToastContext';
import type { ResumeTemplate, TemplateRecommendation } from '../types';

export default function Templates() {
  const [templates, setTemplates] = useState<ResumeTemplate[] | null>(null);
  const [selected, setSelected] = useState('');
  const [recommendation, setRecommendation] = useState<TemplateRecommendation | null>(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ templates: ResumeTemplate[]; selected: string }>('/templates');
        setTemplates(res.templates);
        setSelected(res.selected);
        const rec = await api.get<TemplateRecommendation>('/templates/recommendation');
        setRecommendation(rec);
      } catch (err) {
        toast.show(err instanceof ApiError ? err.message : 'Could not load templates.', 'error');
        setTemplates([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function select(templateId: string) {
    setBusy(templateId);
    try {
      await api.put('/templates/select', { templateId });
      setSelected(templateId);
      toast.show(`${templateId} is now your default template.`, 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Selection failed.', 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Resume Templates</h1>
        <p className="mt-1 text-sm text-ink-500">
          All templates are single-column, standard-heading and selectable-text — ATS-safe by construction. Content and presentation stay separate: your Master CV is never changed by a template.
        </p>
      </div>

      {recommendation && (
        <div className="card border-brand-100 bg-brand-50/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-brand-900">Recommended for your profile: {recommendation.template.name}</h2>
            <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy === recommendation.templateId} onClick={() => void select(recommendation.templateId)}>
              Use recommendation
            </button>
          </div>
          <p className="mt-1.5 text-sm text-brand-800">{recommendation.reason}</p>
          <p className="mt-1 text-xs text-ink-500">Deterministic suggestion based on your CV content{` `}— you always choose manually.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(templates || []).map((t) => (
          <div key={t.id} className={`card flex flex-col p-5 ${selected === t.id ? 'border-brand-400 ring-1 ring-brand-200' : ''}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-900">{t.name}</h2>
              {selected === t.id && <span className="chip bg-brand-50 text-brand-700">Default</span>}
            </div>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">{t.description}</p>
            <p className="mt-2 text-xs text-ink-400">Best for: {t.bestFor.join(', ')}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="chip bg-emerald-50 text-emerald-700">ATS-safe</span>
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                disabled={busy === t.id || selected === t.id}
                onClick={() => void select(t.id)}
              >
                {selected === t.id ? 'Selected' : 'Set as default'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-400">
        Tip: download a resume PDF with a specific template from any resume version (the template picker on the version or the query parameter overrides your default).
      </p>
    </div>
  );
}
