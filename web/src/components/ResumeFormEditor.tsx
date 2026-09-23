// Full resume form editor used by onboarding review, the Master CV page and
// the resume editor's editing pane.

import { useState } from 'react';
import type { ResumeData, ExperienceItem, ProjectItem, EducationItem, CertificationItem, LanguageItem } from '../types';

type Patch = (fn: (draft: ResumeData) => void) => void;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function Accordion({ title, subtitle, defaultOpen = false, children, right }: { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode; right?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <button className="flex flex-1 items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>
            <span className="text-sm font-semibold text-ink-900">{title}</span>
            {subtitle && <span className="ml-2 text-xs text-ink-400">{subtitle}</span>}
          </span>
          <span className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
        </button>
        {right}
      </div>
      {open && <div className="border-t border-ink-100 px-5 py-4">{children}</div>}
    </div>
  );
}

function RowButtons({ onUp, onDown, onDelete, upDisabled, downDisabled }: { onUp: () => void; onDown: () => void; onDelete: () => void; upDisabled?: boolean; downDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onUp} disabled={upDisabled} aria-label="Move up">↑</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onDown} disabled={downDisabled} aria-label="Move down">↓</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={onDelete} aria-label="Delete">✕</button>
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function BulletList({ bullets, onChange, label }: { bullets: string[]; onChange: (b: string[]) => void; label: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="space-y-2">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              className="input min-h-[56px] flex-1"
              value={b}
              rows={2}
              aria-label={`${label} ${i + 1}`}
              onChange={(e) => onChange(bullets.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <div className="flex flex-col gap-1">
              <button type="button" className="btn-ghost px-2 py-0.5 text-xs" aria-label="Move bullet up" disabled={i === 0}
                onClick={() => onChange(move(bullets, i, i - 1))}>↑</button>
              <button type="button" className="btn-ghost px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" aria-label="Remove bullet"
                onClick={() => onChange(bullets.filter((_, j) => j !== i))}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" onClick={() => onChange([...bullets, ''])}>
        + Add bullet
      </button>
    </div>
  );
}

function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().replace(/,$/, '');
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            {v}
            <button type="button" className="ml-0.5 font-bold text-brand-400 hover:text-brand-700" aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="input flex-1"
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-secondary px-3" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function PersonalSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  const p = resume.personal;
  const set = (key: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patch((d) => {
      (d.personal as unknown as Record<string, string>)[key] = e.target.value;
    });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label className="label">Full name</label><input className="input" value={p.fullName} onChange={set('fullName')} /></div>
      <div><label className="label">Target / current job title</label><input className="input" value={p.headline || ''} onChange={set('headline')} placeholder="e.g. Backend Engineer" /></div>
      <div><label className="label">Email</label><input className="input" type="email" value={p.email} onChange={set('email')} /></div>
      <div><label className="label">Phone</label><input className="input" value={p.phone} onChange={set('phone')} /></div>
      <div><label className="label">Location</label><input className="input" value={p.location} onChange={set('location')} placeholder="City, Country" /></div>
      <div><label className="label">LinkedIn</label><input className="input" value={p.linkedin || ''} onChange={set('linkedin')} placeholder="linkedin.com/in/…" /></div>
      <div><label className="label">GitHub</label><input className="input" value={p.github || ''} onChange={set('github')} placeholder="github.com/…" /></div>
      <div><label className="label">Portfolio</label><input className="input" value={p.portfolio || ''} onChange={set('portfolio')} placeholder="your site" /></div>
    </div>
  );
}

function ExperienceSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  const items = resume.experience;
  const update = (i: number, key: keyof ExperienceItem, value: unknown) =>
    patch((d) => {
      (d.experience[i] as unknown as Record<string, unknown>)[key] = value;
    });
  return (
    <div className="space-y-4">
      {items.map((e, i) => (
        <div key={e.id} className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Role {i + 1}</span>
            <RowButtons
              onUp={() => patch((d) => { d.experience = move(d.experience, i, i - 1); })}
              onDown={() => patch((d) => { d.experience = move(d.experience, i, i + 1); })}
              onDelete={() => patch((d) => { d.experience = d.experience.filter((_, j) => j !== i); })}
              upDisabled={i === 0}
              downDisabled={i === items.length - 1}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Job title</label><input className="input" value={e.title} onChange={(ev) => update(i, 'title', ev.target.value)} /></div>
            <div><label className="label">Company</label><input className="input" value={e.company} onChange={(ev) => update(i, 'company', ev.target.value)} /></div>
            <div><label className="label">Start (MM/YYYY)</label><input className="input" value={e.startDate} placeholder="08/2022" onChange={(ev) => update(i, 'startDate', ev.target.value)} /></div>
            <div>
              <label className="label">End</label>
              <div className="flex items-center gap-3">
                <input className="input flex-1" value={e.current ? 'Present' : e.endDate} disabled={e.current} onChange={(ev) => update(i, 'endDate', ev.target.value)} />
                <label className="flex items-center gap-1.5 text-sm text-ink-600">
                  <input type="checkbox" checked={e.current} onChange={(ev) => update(i, 'current', ev.target.checked)} />
                  Current
                </label>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <BulletList label="Achievement bullets" bullets={e.bullets} onChange={(b) => update(i, 'bullets', b)} />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        onClick={() =>
          patch((d) => {
            d.experience.push({ id: makeId('exp'), company: '', title: '', location: '', startDate: '', endDate: '', current: false, bullets: [''] });
          })
        }
      >
        + Add role
      </button>
    </div>
  );
}

function ProjectsSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  const items = resume.projects;
  const update = (i: number, key: keyof ProjectItem, value: unknown) =>
    patch((d) => {
      (d.projects[i] as unknown as Record<string, unknown>)[key] = value;
    });
  return (
    <div className="space-y-4">
      {items.map((p, i) => (
        <div key={p.id} className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Project {i + 1}</span>
            <RowButtons
              onUp={() => patch((d) => { d.projects = move(d.projects, i, i - 1); })}
              onDown={() => patch((d) => { d.projects = move(d.projects, i, i + 1); })}
              onDelete={() => patch((d) => { d.projects = d.projects.filter((_, j) => j !== i); })}
              upDisabled={i === 0}
              downDisabled={i === items.length - 1}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Name</label><input className="input" value={p.name} onChange={(ev) => update(i, 'name', ev.target.value)} /></div>
            <div><label className="label">Link</label><input className="input" value={p.link || ''} onChange={(ev) => update(i, 'link', ev.target.value)} /></div>
          </div>
          <div className="mt-3"><label className="label">Short description</label><input className="input" value={p.description || ''} onChange={(ev) => update(i, 'description', ev.target.value)} /></div>
          <div className="mt-3">
            <BulletList label="Project bullets" bullets={p.bullets} onChange={(b) => update(i, 'bullets', b)} />
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => patch((d) => { d.projects.push({ id: makeId('prj'), name: '', link: '', description: '', bullets: [''], tech: [] }); })}>
        + Add project
      </button>
    </div>
  );
}

function EducationSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  const items = resume.education;
  const update = (i: number, key: keyof EducationItem, value: unknown) =>
    patch((d) => {
      (d.education[i] as unknown as Record<string, unknown>)[key] = value;
    });
  return (
    <div className="space-y-4">
      {items.map((ed, i) => (
        <div key={ed.id} className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Education {i + 1}</span>
            <RowButtons
              onUp={() => patch((d) => { d.education = move(d.education, i, i - 1); })}
              onDown={() => patch((d) => { d.education = move(d.education, i, i + 1); })}
              onDelete={() => patch((d) => { d.education = d.education.filter((_, j) => j !== i); })}
              upDisabled={i === 0}
              downDisabled={i === items.length - 1}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Qualification</label><input className="input" value={ed.degree} placeholder="BSc" onChange={(ev) => update(i, 'degree', ev.target.value)} /></div>
            <div><label className="label">Field</label><input className="input" value={ed.field || ''} placeholder="Computer Science" onChange={(ev) => update(i, 'field', ev.target.value)} /></div>
            <div><label className="label">Institution</label><input className="input" value={ed.institution} onChange={(ev) => update(i, 'institution', ev.target.value)} /></div>
            <div><label className="label">Grade</label><input className="input" value={ed.grade || ''} onChange={(ev) => update(i, 'grade', ev.target.value)} /></div>
            <div><label className="label">Start</label><input className="input" value={ed.startDate} placeholder="2017" onChange={(ev) => update(i, 'startDate', ev.target.value)} /></div>
            <div><label className="label">End</label><input className="input" value={ed.endDate} placeholder="2021" onChange={(ev) => update(i, 'endDate', ev.target.value)} /></div>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => patch((d) => { d.education.push({ id: makeId('edu'), institution: '', degree: '', field: '', startDate: '', endDate: '', grade: '' }); })}>
        + Add education
      </button>
    </div>
  );
}

function SkillsSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="label">Technical skills</label>
        <ChipInput values={resume.skills.technical} placeholder="Type a skill and press Enter (e.g. Java)" onChange={(v) => patch((d) => { d.skills.technical = v; })} />
      </div>
      <div>
        <label className="label">Soft skills</label>
        <ChipInput values={resume.skills.soft} placeholder="e.g. Communication" onChange={(v) => patch((d) => { d.skills.soft = v; })} />
      </div>
    </div>
  );
}

function CertificationsSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  const update = (i: number, key: keyof CertificationItem, value: string) =>
    patch((d) => {
      (d.certifications[i] as unknown as Record<string, string>)[key] = value;
    });
  return (
    <div className="space-y-3">
      {resume.certifications.map((c, i) => (
        <div key={c.id} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1"><label className="label">Name</label><input className="input" value={c.name} onChange={(e) => update(i, 'name', e.target.value)} /></div>
          <div className="w-40"><label className="label">Issuer</label><input className="input" value={c.issuer || ''} onChange={(e) => update(i, 'issuer', e.target.value)} /></div>
          <div className="w-24"><label className="label">Year</label><input className="input" value={c.year || ''} onChange={(e) => update(i, 'year', e.target.value)} /></div>
          <button type="button" className="btn-ghost mb-0.5 text-red-600 hover:bg-red-50" aria-label="Remove certification"
            onClick={() => patch((d) => { d.certifications = d.certifications.filter((_, j) => j !== i); })}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => patch((d) => { d.certifications.push({ id: makeId('cert'), name: '', issuer: '', year: '' }); })}>
        + Add certification
      </button>
    </div>
  );
}

function LanguagesSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  const update = (i: number, key: keyof LanguageItem, value: string) =>
    patch((d) => {
      (d.languages[i] as unknown as Record<string, string>)[key] = value;
    });
  return (
    <div className="space-y-3">
      {resume.languages.map((l, i) => (
        <div key={l.id} className="flex items-end gap-2">
          <div className="flex-1"><label className="label">Language</label><input className="input" value={l.name} onChange={(e) => update(i, 'name', e.target.value)} /></div>
          <div className="w-44"><label className="label">Proficiency</label><input className="input" value={l.proficiency || ''} placeholder="Fluent" onChange={(e) => update(i, 'proficiency', e.target.value)} /></div>
          <button type="button" className="btn-ghost mb-0.5 text-red-600 hover:bg-red-50" aria-label="Remove language"
            onClick={() => patch((d) => { d.languages = d.languages.filter((_, j) => j !== i); })}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => patch((d) => { d.languages.push({ id: makeId('lang'), name: '', proficiency: '' }); })}>
        + Add language
      </button>
    </div>
  );
}

function AchievementsSection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  return (
    <BulletList label="Achievements" bullets={resume.achievements.length ? resume.achievements : ['']} onChange={(a) => patch((d) => { d.achievements = a.filter((x) => x.trim()); })} />
  );
}

function SummarySection({ resume, patch }: { resume: ResumeData; patch: Patch }) {
  return (
    <div>
      <label className="label">Professional summary</label>
      <textarea
        className="input min-h-[110px]"
        rows={4}
        value={resume.summary}
        placeholder="3–5 lines: your role, years of experience, strongest relevant skills and what you deliver."
        onChange={(e) => patch((d) => { d.summary = e.target.value; })}
      />
      <p className="mt-1.5 text-xs text-ink-400">{resume.summary.trim().split(/\s+/).filter(Boolean).length} words</p>
    </div>
  );
}

export interface ResumeFormEditorProps {
  resume: ResumeData;
  onChange: (updater: (draft: ResumeData) => void) => void;
  openAll?: boolean;
  showPersonal?: boolean;
}

export default function ResumeFormEditor({ resume, onChange, showPersonal = true }: ResumeFormEditorProps) {
  return (
    <div className="space-y-3">
      {showPersonal && (
        <Accordion title="Personal information" defaultOpen>
          <PersonalSection resume={resume} patch={onChange} />
        </Accordion>
      )}
      <Accordion title="Summary"><SummarySection resume={resume} patch={onChange} /></Accordion>
      <Accordion title="Experience" subtitle={`${resume.experience.length} role(s)`}>
        <ExperienceSection resume={resume} patch={onChange} />
      </Accordion>
      <Accordion title="Projects" subtitle={`${resume.projects.length} project(s)`}>
        <ProjectsSection resume={resume} patch={onChange} />
      </Accordion>
      <Accordion title="Education" subtitle={`${resume.education.length} entr${resume.education.length === 1 ? 'y' : 'ies'}`}>
        <EducationSection resume={resume} patch={onChange} />
      </Accordion>
      <Accordion title="Skills">
        <SkillsSection resume={resume} patch={onChange} />
      </Accordion>
      <Accordion title="Certifications">
        <CertificationsSection resume={resume} patch={onChange} />
      </Accordion>
      <Accordion title="Languages">
        <LanguagesSection resume={resume} patch={onChange} />
      </Accordion>
      <Accordion title="Achievements">
        <AchievementsSection resume={resume} patch={onChange} />
      </Accordion>
    </div>
  );
}
