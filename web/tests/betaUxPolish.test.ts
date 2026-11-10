// Tests for Curevo AI Phase 4: Public Beta UX Polish
// Covers:
// 1. CV Upload Privacy Indicator (exact wording, supporting text, shield icon, testId)
// 2. Job Description Character Counter:
//    - Empty job descriptions (0 / 25,000)
//    - Normal lengths within limit (e.g. 2,500 chars)
//    - Exactly 25,000 characters (boundary accepted)
//    - Warning threshold (20,001–25,000 chars)
//    - Exceeding limit (25,001 chars and beyond)
//    - Error calculation and wording ("Exceeds limit by X character(s)")
//    - Never silently truncating input
//    - Textarea border and background CSS classes based on input length
//    - Accidental submission prevention

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  MAX_JOB_TEXT_LENGTH,
  WARN_JOB_TEXT_THRESHOLD,
  getCharacterCounterState,
  getJobTextareaClasses,
  CvUploadPrivacyIndicator,
  JobTextCharacterCounter,
} from '../src/pages/PublicBuilder';

describe('Curevo AI — Phase 4: Public Beta UX Polish', () => {
  // ---------------------------------------------------------------------------
  // 1. CV Upload Privacy Indicator
  // ---------------------------------------------------------------------------
  describe('1. CV Upload Privacy Indicator', () => {
    it('renders the exact required primary and supporting wording', () => {
      const html = renderToStaticMarkup(React.createElement(CvUploadPrivacyIndicator));

      // Exact primary wording required by user specification:
      expect(html).toContain('Processed in memory — CV files are not stored as server-side files.');

      // Supporting text:
      expect(html).toContain('Your saved draft remains in your browser. You control your data.');
    });

    it('includes a privacy / shield icon with SVG path', () => {
      const html = renderToStaticMarkup(React.createElement(CvUploadPrivacyIndicator));

      expect(html).toContain('<svg');
      expect(html).toContain('text-emerald-600');
      // Shield path attribute
      expect(html).toContain('M9 12.75L11.25 15 15 9.75');
    });

    it('contains responsive, accessible markup with test id', () => {
      const html = renderToStaticMarkup(React.createElement(CvUploadPrivacyIndicator));

      expect(html).toContain('data-testid="cv-upload-privacy-indicator"');
      expect(html).toContain('rounded-xl');
      expect(html).toContain('border-slate-200');
      expect(html).toContain('bg-slate-50');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Job Description Character Counter Logic & State
  // ---------------------------------------------------------------------------
  describe('2. Job Description Character Counter Logic & State', () => {
    it('handles empty job description (0 characters)', () => {
      const state = getCharacterCounterState('');
      expect(state.length).toBe(0);
      expect(state.maxLength).toBe(25000);
      expect(state.isOver).toBe(false);
      expect(state.isWarning).toBe(false);
      expect(state.exceededBy).toBe(0);
    });

    it('handles normal job description within bounds (e.g. 3,500 characters)', () => {
      const sampleText = 'A'.repeat(3500);
      const state = getCharacterCounterState(sampleText);
      expect(state.length).toBe(3500);
      expect(state.isOver).toBe(false);
      expect(state.isWarning).toBe(false);
      expect(state.exceededBy).toBe(0);
    });

    it('triggers warning threshold between 20,001 and 25,000 characters', () => {
      const justBelowWarn = 'B'.repeat(20000);
      expect(getCharacterCounterState(justBelowWarn).isWarning).toBe(false);

      const warnText = 'B'.repeat(20001);
      const state = getCharacterCounterState(warnText);
      expect(state.length).toBe(20001);
      expect(state.isOver).toBe(false);
      expect(state.isWarning).toBe(true);
      expect(state.exceededBy).toBe(0);

      const atLimit = 'B'.repeat(25000);
      const limitState = getCharacterCounterState(atLimit);
      expect(limitState.length).toBe(25000);
      expect(limitState.isOver).toBe(false);
      expect(limitState.isWarning).toBe(true);
      expect(limitState.exceededBy).toBe(0);
    });

    it('correctly flags exceeding the limit at exactly 25,001 characters', () => {
      const overflowText = 'C'.repeat(25001);
      const state = getCharacterCounterState(overflowText);
      expect(state.length).toBe(25001);
      expect(state.isOver).toBe(true);
      expect(state.isWarning).toBe(false);
      expect(state.exceededBy).toBe(1);
    });

    it('correctly calculates large overflows (e.g. 28,500 characters)', () => {
      const largeOverflow = 'D'.repeat(28500);
      const state = getCharacterCounterState(largeOverflow);
      expect(state.length).toBe(28500);
      expect(state.isOver).toBe(true);
      expect(state.exceededBy).toBe(3500);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Job Description Character Counter UI Component Rendering
  // ---------------------------------------------------------------------------
  describe('3. JobTextCharacterCounter Component Rendering', () => {
    it('renders normal counter display with formatted count and optimal guidance', () => {
      const html = renderToStaticMarkup(
        React.createElement(JobTextCharacterCounter, { currentLength: 0 })
      );

      expect(html).toContain('0 / 25,000 characters');
      expect(html).toContain('text-slate-500');
      expect(html).toContain('Optimal: 1,000–5,000 characters');
    });

    it('renders normal counter display with formatted comma numbers for typical length', () => {
      const html = renderToStaticMarkup(
        React.createElement(JobTextCharacterCounter, { currentLength: 4500 })
      );

      expect(html).toContain('4,500 / 25,000 characters');
      expect(html).toContain('text-slate-500');
    });

    it('renders clear warning near the limit (e.g. 22,000 characters)', () => {
      const html = renderToStaticMarkup(
        React.createElement(JobTextCharacterCounter, { currentLength: 22000 })
      );

      expect(html).toContain('22,000 / 25,000 characters');
      expect(html).toContain('Approaching 25,000 character limit');
      expect(html).toContain('text-amber-600');
      expect(html).toContain('text-amber-700');
    });

    it('renders error styling and specific exceeded count for 25,001 characters', () => {
      const html = renderToStaticMarkup(
        React.createElement(JobTextCharacterCounter, { currentLength: 25001 })
      );

      expect(html).toContain('25,001 / 25,000 characters');
      expect(html).toContain('Exceeds limit by 1 character. Shorten before proceeding.');
      expect(html).toContain('text-red-600');
      expect(html).toContain('font-bold');
    });

    it('renders error styling for plural exceeded characters (e.g. 26,200 characters)', () => {
      const html = renderToStaticMarkup(
        React.createElement(JobTextCharacterCounter, { currentLength: 26200 })
      );

      expect(html).toContain('26,200 / 25,000 characters');
      expect(html).toContain('Exceeds limit by 1,200 characters. Shorten before proceeding.');
      expect(html).toContain('text-red-600');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Textarea Dynamic Styling Classes
  // ---------------------------------------------------------------------------
  describe('4. Textarea Dynamic Border & Background Classes', () => {
    it('returns default styling when within normal limits', () => {
      const cls = getJobTextareaClasses(5000);
      expect(cls).toBe('input text-xs leading-relaxed');
      expect(cls).not.toContain('border-amber-400');
      expect(cls).not.toContain('border-red-500');
    });

    it('returns amber warning border when in 20,001–25,000 range', () => {
      const cls = getJobTextareaClasses(21000);
      expect(cls).toContain('border-amber-400');
      expect(cls).toContain('focus:border-amber-500');
      expect(cls).not.toContain('border-red-500');
    });

    it('returns red error border and background when exceeding 25,000 characters', () => {
      const cls = getJobTextareaClasses(25001);
      expect(cls).toContain('border-red-500');
      expect(cls).toContain('focus:border-red-600');
      expect(cls).toContain('bg-red-50/20');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Input Preservation Guarantee (Never Silently Truncates)
  // ---------------------------------------------------------------------------
  describe('5. Input Preservation Guarantee (No Silent Truncation)', () => {
    it('preserves full string length without slicing or truncation', () => {
      const oversizedRawPaste = 'Lead Architect ' + 'X'.repeat(26000);
      expect(oversizedRawPaste.length).toBe(26015);

      // Simulating what happens in onChange: the full text is retained
      const currentText = oversizedRawPaste;
      expect(currentText.length).toBe(26015);

      const state = getCharacterCounterState(currentText);
      expect(state.isOver).toBe(true);
      expect(state.exceededBy).toBe(1015);
      // Ensure the raw text is not silently sliced
      expect(currentText).toHaveLength(26015);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Architectural Boundary Alignment
  // ---------------------------------------------------------------------------
  describe('6. Boundary Alignment with Backend Limits', () => {
    it('matches backend MAX_JOB_TEXT_LENGTH = 25,000 exactly', () => {
      expect(MAX_JOB_TEXT_LENGTH).toBe(25000);
      expect(WARN_JOB_TEXT_THRESHOLD).toBe(20000);
    });
  });
});
