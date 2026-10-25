// Safe binary inspection of ZIP archives for DOCX resume extraction.
// Guards against decompression bombs, ZIP64 overflows, malformed structures,
// and archives lacking valid OpenXML Word document parts.

import { AppError } from '../../middleware/errors';

export const MAX_ZIP_ENTRIES = 250;
export const MAX_UNCOMPRESSED_TOTAL = 20 * 1024 * 1024; // 20 MB
export const MAX_COMPRESSION_RATIO = 15;

export interface ZipInspectionResult {
  totalEntries: number;
  totalCompressed: number;
  totalUncompressed: number;
  hasDocxContent: boolean;
}

const PARSE_FAILED_MSG = 'We could not read this file. It may be empty, scanned, or corrupted — try exporting it as a text-based PDF or DOCX.';

/**
 * Safely inspects the ZIP central directory using pure Node.js Buffers.
 * Validates entries, size limits, compression ratios, and DOCX structure before decompression.
 */
export function inspectZipArchive(buffer: Buffer): ZipInspectionResult {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new AppError('PARSE_FAILED', PARSE_FAILED_MSG, 422);
  }

  // Check magic bytes: PK\x03\x04 (standard local file header) or PK\x05\x06 (empty zip)
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    (buffer[2] !== 0x03 && buffer[2] !== 0x05) ||
    (buffer[3] !== 0x04 && buffer[3] !== 0x06)
  ) {
    throw new AppError('PARSE_FAILED', 'File does not match valid DOCX archive signature.', 422);
  }

  // Search backwards for the End of Central Directory (EOCD) record (signature: 0x06054b50)
  // Max comment length is 65,535 bytes; EOCD is 22 bytes minimum.
  let eocdOffset = -1;
  const maxSearch = Math.min(buffer.length, 65535 + 22);
  const minOffset = buffer.length - maxSearch;

  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new AppError('PARSE_FAILED', 'Invalid DOCX file: unable to locate ZIP central directory.', 422);
  }

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const cdDiskNumber = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);

  if (eocdOffset + 22 + commentLength > buffer.length) {
    throw new AppError('PARSE_FAILED', 'Invalid DOCX file: malformed ZIP comment structure.', 422);
  }

  if (diskNumber !== 0 || cdDiskNumber !== 0 || entriesOnDisk !== totalEntries) {
    throw new AppError('PARSE_FAILED', 'Multi-disk or segmented ZIP archives are not supported.', 422);
  }

  // Reject ZIP64 indicators (standard DOCX resumes never require 64-bit structures)
  if (totalEntries === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new AppError('PARSE_FAILED', 'ZIP64 archives exceed allowed DOCX specifications.', 422);
  }

  // Enforce entry count limit
  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new AppError('PARSE_FAILED', `Archive contains too many entries (${totalEntries} > ${MAX_ZIP_ENTRIES}).`, 422);
  }

  // Boundary verification for Central Directory
  if (cdOffset + cdSize > eocdOffset || cdOffset < 0 || cdOffset >= buffer.length) {
    throw new AppError('PARSE_FAILED', 'Invalid DOCX file: malformed central directory bounds.', 422);
  }

  let curr = cdOffset;
  let count = 0;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let hasDocxContent = false;

  while (count < totalEntries && curr < cdOffset + cdSize) {
    if (curr + 46 > cdOffset + cdSize) {
      throw new AppError('PARSE_FAILED', 'Invalid DOCX file: truncated central directory header.', 422);
    }

    const sig = buffer.readUInt32LE(curr);
    if (sig !== 0x02014b50) {
      throw new AppError('PARSE_FAILED', 'Invalid DOCX file: corrupted central directory entry.', 422);
    }

    const flags = buffer.readUInt16LE(curr + 8);
    const compressedSize = buffer.readUInt32LE(curr + 20);
    const uncompressedSize = buffer.readUInt32LE(curr + 24);
    const fileNameLen = buffer.readUInt16LE(curr + 28);
    const extraLen = buffer.readUInt16LE(curr + 30);
    const commentLen = buffer.readUInt16LE(curr + 32);
    const localHeaderOffset = buffer.readUInt32LE(curr + 42);

    if (curr + 46 + fileNameLen + extraLen + commentLen > cdOffset + cdSize) {
      throw new AppError('PARSE_FAILED', 'Invalid DOCX file: central directory entry exceeds bounds.', 422);
    }

    if (localHeaderOffset + 30 > buffer.length) {
      throw new AppError('PARSE_FAILED', 'Invalid DOCX file: local header offset out of bounds.', 422);
    }

    // Verify local header signature at indicated offset
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new AppError('PARSE_FAILED', 'Invalid DOCX file: corrupted local header signature.', 422);
    }

    const localFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    if (localHeaderOffset + 30 + localFileNameLen + localExtraLen + compressedSize > buffer.length) {
      throw new AppError('PARSE_FAILED', 'Invalid DOCX file: entry compressed payload exceeds file bounds.', 422);
    }

    // When data descriptor (bit 3) is not used, cross-verify local header size with central directory
    const hasDataDescriptor = (flags & 0x08) !== 0;
    if (!hasDataDescriptor) {
      const localComp = buffer.readUInt32LE(localHeaderOffset + 18);
      const localUncomp = buffer.readUInt32LE(localHeaderOffset + 22);
      if (localComp !== compressedSize || localUncomp !== uncompressedSize) {
        throw new AppError('PARSE_FAILED', 'Invalid DOCX file: inconsistent size metadata detected.', 422);
      }
    }

    // Reject ZIP64 entry sizes
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new AppError('PARSE_FAILED', 'ZIP64 file entries are not permitted.', 422);
    }

    // Check compression ratio per entry
    if (uncompressedSize > 0) {
      if (compressedSize === 0) {
        throw new AppError('PARSE_FAILED', 'Invalid DOCX file: decompression bomb detected (zero compressed size).', 422);
      }
      if (uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
        throw new AppError('PARSE_FAILED', `Compression ratio for entry exceeds maximum limit of ${MAX_COMPRESSION_RATIO}:1.`, 422);
      }
    }

    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;

    // Enforce total uncompressed size limit
    if (totalUncompressed > MAX_UNCOMPRESSED_TOTAL) {
      throw new AppError(
        'PARSE_FAILED',
        `Total uncompressed content exceeds the maximum limit of ${MAX_UNCOMPRESSED_TOTAL / (1024 * 1024)} MB.`,
        422,
      );
    }

    const fileName = buffer.toString('utf8', curr + 46, curr + 46 + fileNameLen);
    if (fileName === '[Content_Types].xml' || fileName.startsWith('word/')) {
      hasDocxContent = true;
    }

    curr += 46 + fileNameLen + extraLen + commentLen;
    count++;
  }

  if (count !== totalEntries || curr !== cdOffset + cdSize) {
    throw new AppError('PARSE_FAILED', 'Invalid DOCX file: incomplete central directory traversal.', 422);
  }

  // Enforce overall compression ratio
  if (totalUncompressed / Math.max(totalCompressed, 1) > MAX_COMPRESSION_RATIO) {
    throw new AppError('PARSE_FAILED', `Total compression ratio exceeds maximum limit of ${MAX_COMPRESSION_RATIO}:1.`, 422);
  }

  // Verify that archive has standard Word document components
  if (!hasDocxContent) {
    throw new AppError('PARSE_FAILED', 'The uploaded file is a ZIP archive but does not contain valid Word document data.', 422);
  }

  return { totalEntries, totalCompressed, totalUncompressed, hasDocxContent };
}
