// Shared types for the layout-aware extraction pipeline.
// Ingestion produces ParsedLine[]; everything downstream (sections, fields,
// validation) works on that single representation regardless of source.

export interface ParsedLine {
  text: string;
  /** Typography signals (best-effort; not all formats provide them). */
  bold?: boolean;
  isListItem?: boolean;
  pageNumber?: number;
  /** Vertical position within the page (PDF only; descending per page). */
  y?: number;
  /** Horizontal start of the line (PDF only). */
  x?: number;
  width?: number;
  height?: number;
  /** 0 = full width, 1 = left column, 2 = right column (PDF only). */
  column?: number;
  /** Position in the reconstructed reading order. */
  index?: number;
}

export interface SectionSpan {
  /** canonical key: header | summary | experience | education | skills | projects | certifications | achievements | languages | soft | publications | volunteering | interests | certifications+interests */
  key: string;
  title: string;
  lines: ParsedLine[];
}

export interface ExtractionMeta {
  pageCount: number;
  multiColumn: boolean;
  sectionOrderDetected: string[];
  warnings: string[];
}

export type Confidence = 'high' | 'medium' | 'low';
