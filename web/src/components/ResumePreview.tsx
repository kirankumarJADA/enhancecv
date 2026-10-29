// Live A4-style resume preview. Mirrors the server-side PDF layout
// (single column, standard headings, simple bullets) so what you edit is
// what you download.

import type { ResumeData, SectionKey, PageSize } from '../types';

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: 'Professional Summary',
  experience: 'Professional Experience',
  projects: 'Projects',
  education: 'Education',
  skills: 'Skills',
  certifications: 'Certifications',
  languages: 'Languages',
  achievements: 'Achievements',
};

function Heading({ children, template }: { children: React.ReactNode; template?: string }) {
  if (template === 'modern') {
    return (
      <div className="paper-heading" style={{ color: '#1d4ed8', borderBottomColor: '#93c5fd' }}>
        {children}
      </div>
    );
  }
  if (template === 'minimal') {
    return (
      <div className="paper-heading" style={{ borderBottom: '1px solid #e2e8f0', color: '#475569', letterSpacing: '0.05em' }}>
        {children}
      </div>
    );
  }
  if (template === 'executive') {
    return (
      <div className="paper-heading" style={{ color: '#0f172a', borderBottom: '2px solid #0f172a', fontWeight: 800 }}>
        {children}
      </div>
    );
  }
  if (template === 'technical') {
    return (
      <div className="paper-heading" style={{ color: '#0f766e', borderBottom: '1.5px solid #5eead4' }}>
        {children}
      </div>
    );
  }
  if (template === 'professional') {
    return (
      <div className="paper-heading" style={{ color: '#0f2b46', borderBottom: '1.5px solid #cbd5e1' }}>
        {children}
      </div>
    );
  }
  return <div className="paper-heading">{children}</div>;
}

function Dates({ start, end, current }: { start?: string; end?: string; current?: boolean }) {
  const s = start || '';
  const e = current ? 'Present' : end || '';
  const text = [s, e].filter(Boolean).join(' – ');
  if (!text) return null;
  return <span className="paper-dates">{text}</span>;
}

export default function ResumePreview({
  resume,
  scale = 1,
  template = 'classic',
  marginDensity = 'normal',
  pageSize = 'A4',
}: {
  resume: ResumeData;
  scale?: number;
  template?: string;
  marginDensity?: 'compact' | 'normal' | 'spacious';
  pageSize?: PageSize;
}) {
  const p = resume.personal;
  const visible: string[] = (resume.sectionOrder?.length ? resume.sectionOrder : (Object.keys(SECTION_LABELS) as SectionKey[])).filter(
    (k) => !(resume.hiddenSections || []).includes(k)
  );

  const contactBits = [p.headline, p.email, p.phone, p.location].filter(Boolean) as string[];
  const linkBits = [p.linkedin, p.github, p.portfolio].filter(Boolean) as string[];

  const isA4 = (pageSize || 'A4').toUpperCase() === 'A4';
  const paddingStyle =
    marginDensity === 'compact'
      ? { padding: '32px 36px', minHeight: isA4 ? '980px' : '920px' }
      : marginDensity === 'spacious'
      ? { padding: '64px 68px' }
      : { padding: '48px 52px' };

  return (
    <div
      className={`paper template-${template} page-size-${(pageSize || 'A4').toLowerCase()}`}
      style={{
        ...(scale !== 1 ? { zoom: scale } : {}),
        ...paddingStyle,
      }}
    >
      <h1>{p.fullName || 'Your Name'}</h1>
      <div className="muted" style={{ fontSize: 12 }}>{contactBits.join('  |  ')}</div>
      {linkBits.length > 0 && <div style={{ fontSize: 11.5, color: '#2b6cb0' }}>{linkBits.join('  |  ')}</div>}

      {visible.map((key) => {
        if (key.startsWith('custom_')) {
          const custom = (resume.customSections || []).find((c) => c.id === key);
          if (!custom || custom.bullets.filter(Boolean).length === 0) return null;
          return (
            <section key={key}>
              <Heading template={template}>{custom.title}</Heading>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {custom.bullets.filter(Boolean).map((b, i) => (
                  <li key={i} style={{ listStyle: 'disc' }}>{b}</li>
                ))}
              </ul>
            </section>
          );
        }
        switch (key) {
          case 'summary':
            if (!resume.summary?.trim()) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                <p style={{ whiteSpace: 'pre-wrap' }}>{resume.summary}</p>
              </section>
            );
          case 'experience': {
            if (resume.experience.length === 0) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                {resume.experience.map((e) => (
                  <div key={e.id} style={{ marginBottom: 10 }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="paper-item-title">{e.title || e.company || 'Role'}</span>
                      <Dates start={e.startDate} end={e.endDate} current={e.current} />
                    </div>
                    {(e.title || e.company) && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {e.company}
                        {e.title && e.company ? '' : ''}
                        {e.location ? `, ${e.location}` : ''}
                      </div>
                    )}
                    <ul style={{ margin: '3px 0 0', paddingLeft: 16 }}>
                      {e.bullets.filter(Boolean).map((b, i) => (
                        <li key={i} style={{ listStyle: 'disc' }}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          }
          case 'projects': {
            if (resume.projects.length === 0) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                {resume.projects.map((pr) => (
                  <div key={pr.id} style={{ marginBottom: 8 }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="paper-item-title">{pr.name || 'Project'}</span>
                      {pr.link && <span className="paper-dates">{pr.link}</span>}
                    </div>
                    {pr.description && <div className="muted" style={{ fontSize: 12 }}>{pr.description}</div>}
                    {pr.tech && pr.tech.length > 0 && (
                      <div style={{ fontSize: 11.5, fontStyle: 'italic' }} className="muted">{pr.tech.join(', ')}</div>
                    )}
                    <ul style={{ margin: '3px 0 0', paddingLeft: 16 }}>
                      {pr.bullets.filter(Boolean).map((b, i) => (
                        <li key={i} style={{ listStyle: 'disc' }}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          }
          case 'skills': {
            const tech = resume.skills.technical.filter(Boolean);
            const soft = resume.skills.soft.filter(Boolean);
            if (tech.length === 0 && soft.length === 0) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                {tech.length > 0 && (
                  <p>
                    <strong>Technical Skills:</strong> {tech.join(', ')}
                  </p>
                )}
                {soft.length > 0 && (
                  <p>
                    <strong>Soft Skills:</strong> {soft.join(', ')}
                  </p>
                )}
              </section>
            );
          }
          case 'education': {
            if (resume.education.length === 0) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                {resume.education.map((ed) => (
                  <div key={ed.id} style={{ marginBottom: 6 }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="paper-item-title">
                        {ed.degree}
                        {ed.field ? `, ${ed.field}` : ''}
                      </span>
                      <Dates start={ed.startDate} end={ed.endDate} />
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {[ed.institution, ed.grade].filter(Boolean).join('  |  ')}
                    </div>
                  </div>
                ))}
              </section>
            );
          }
          case 'certifications': {
            if (resume.certifications.length === 0) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {resume.certifications.map((c) => (
                    <li key={c.id} style={{ listStyle: 'disc' }}>
                      {[c.name, c.issuer, c.year].filter(Boolean).join(' — ')}
                    </li>
                  ))}
                </ul>
              </section>
            );
          }
          case 'languages': {
            if (resume.languages.length === 0) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                <p>{resume.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(', ')}</p>
              </section>
            );
          }
          case 'achievements': {
            if (resume.achievements.length === 0) return null;
            return (
              <section key={key}>
                <Heading template={template}>{SECTION_LABELS[key]}</Heading>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {resume.achievements.filter(Boolean).map((a, i) => (
                    <li key={i} style={{ listStyle: 'disc' }}>{a}</li>
                  ))}
                </ul>
              </section>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
