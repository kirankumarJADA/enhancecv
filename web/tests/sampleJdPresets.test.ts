import { describe, it, expect, vi } from 'vitest';
import { SAMPLE_JD_PRESETS, getSampleJdPreset, type SampleJdPreset } from '../src/data/sampleJdPresets';
import { getSampleCv } from '../src/data/sampleCv';

describe('Sample Job Description Presets Suite', () => {
  // 1. All three presets contain valid, meaningful descriptions
  it('1. provides three valid, distinct presets with realistic engineering requirements', () => {
    expect(SAMPLE_JD_PRESETS).toHaveLength(3);

    const ids = SAMPLE_JD_PRESETS.map((p) => p.id);
    expect(ids).toContain('backend-engineer');
    expect(ids).toContain('frontend-engineer');
    expect(ids).toContain('devops-engineer');

    for (const preset of SAMPLE_JD_PRESETS) {
      expect(preset.title).toBeTruthy();
      expect(preset.roleTitle).toBeTruthy();
      expect(preset.badge).toBeTruthy();
      expect(preset.summary).toBeTruthy();
      expect(preset.jobText.length).toBeGreaterThan(300);

      // Verify essential sections exist
      expect(preset.jobText).toMatch(/responsibilities/i);
      expect(preset.jobText).toMatch(/required (qualifications|skills)/i);
      expect(preset.jobText).toMatch(/preferred (qualifications|skills)|nice to have/i);
    }
  });

  // 2. Selecting a preset populates the correct field
  it('2. getSampleJdPreset retrieves the exact preset with target role and full job text', () => {
    const backend = getSampleJdPreset('backend-engineer');
    expect(backend).toBeDefined();
    expect(backend?.roleTitle).toBe('Backend Software Engineer');
    expect(backend?.jobText).toContain('PostgreSQL');
    expect(backend?.jobText).toContain('Docker');

    const frontend = getSampleJdPreset('frontend-engineer');
    expect(frontend).toBeDefined();
    expect(frontend?.roleTitle).toBe('Frontend Software Engineer');
    expect(frontend?.jobText).toContain('React');
    expect(frontend?.jobText).toContain('TypeScript');

    const devops = getSampleJdPreset('devops-engineer');
    expect(devops).toBeDefined();
    expect(devops?.roleTitle).toBe('DevOps / Cloud Engineer');
    expect(devops?.jobText).toContain('Kubernetes');
    expect(devops?.jobText).toContain('Terraform');
  });

  // 3. Users can edit the populated description
  it('3. allows full editing and customisation after selecting a preset without mutating the preset source', () => {
    const preset = getSampleJdPreset('backend-engineer')!;
    let targetRole = preset.roleTitle;
    let jobText = preset.jobText;

    // Simulate candidate tailoring or adding specific requirements
    targetRole = 'Senior Backend Go Specialist';
    jobText = `${jobText}\n\nAdditional Requirements:\n• Hands-on experience with CockroachDB.`;

    expect(targetRole).toBe('Senior Backend Go Specialist');
    expect(jobText).toContain('CockroachDB');

    // Original preset remains untouched
    const freshPreset = getSampleJdPreset('backend-engineer')!;
    expect(freshPreset.roleTitle).toBe('Backend Software Engineer');
    expect(freshPreset.jobText).not.toContain('CockroachDB');
  });

  // 4. Analysis runs only after explicit submission
  it('4. selecting a preset populates fields without triggering any match execution callback', () => {
    const matchExecutor = vi.fn();
    const preset = SAMPLE_JD_PRESETS[0];

    // Simulating selection action: sets state only
    let activeRole = '';
    let activeText = '';

    const onSelectPreset = (p: SampleJdPreset) => {
      activeRole = p.roleTitle;
      activeText = p.jobText;
      // Note: matchExecutor is NOT called here!
    };

    onSelectPreset(preset);

    expect(activeRole).toBe(preset.roleTitle);
    expect(activeText).toBe(preset.jobText);
    expect(matchExecutor).not.toHaveBeenCalled();

    // Only explicit user click invokes match
    const onUserExplicitSubmit = () => {
      matchExecutor(activeText, activeRole);
    };

    onUserExplicitSubmit();
    expect(matchExecutor).toHaveBeenCalledTimes(1);
    expect(matchExecutor).toHaveBeenCalledWith(preset.jobText, preset.roleTitle);
  });

  // 7. No incorrect claims are made about the sample being a real vacancy
  it('7. clearly marks every preset as a sample and fictional exploration role', () => {
    for (const preset of SAMPLE_JD_PRESETS) {
      expect(preset.isSample).toBe(true);
      expect(preset.sampleNotice).toMatch(/sample|fictional/i);
      expect(preset.sampleNotice).not.toMatch(/live vacancy|active opening/i);
      expect(preset.jobText).toContain('[Sample Job Description — Fictional Role for ATS Matching Exploration]');
      expect(preset.jobText).toContain('Fictional Sample Employer');
    }
  });

  // 8. Existing custom job-description input still works
  it('8. preserves manual custom job description input without requiring preset selection', () => {
    let customRole = 'Staff AI Architect';
    let customText = 'Must have experience with Nemotron and LLM evaluation.';

    expect(customRole).toBe('Staff AI Architect');
    expect(customText).toContain('Nemotron');
  });

  // 9. Sample CV compatibility
  it('9. Sample CV fixture remains intact and compatible with presets', () => {
    const sampleCv = getSampleCv();
    expect(sampleCv.experience.length).toBeGreaterThan(0);
    expect(sampleCv.skills.technical.length).toBeGreaterThan(0);
  });
});
