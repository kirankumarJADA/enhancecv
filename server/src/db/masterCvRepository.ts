// Curevo AI — Master CV & Resume Versions Repository (Data Access Layer)
//
// Manages the persistent career profile (Master CV), immutable version snapshots,
// and independent tailored resume versions.
//
// Invariant: Master CV is the user's permanent career source of truth.
// AI tailoring and job adaptations are saved as separate tailored_resume_versions
// and never silently mutate or overwrite the Master CV.

import type { PoolClient } from 'pg';
import { getDb, newId, withUserContext, TS_TEXT, asQueryable } from './db';
import { AppError } from '../middleware/errors';
import type { ResumeData } from '../types';

export interface MasterCvRecord {
  id: string;
  userId: string;
  title: string;
  content: ResumeData;
  targetRole: string;
  revision: number;
  atsScore: number | null;
  atsBreakdown: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface MasterCvVersionRecord {
  id: string;
  masterCvId: string;
  userId: string;
  versionNumber: number;
  versionLabel: string;
  contentSnapshot: ResumeData;
  source: 'manual' | 'autosave' | 'restore' | 'import';
  createdAt: string;
}

export interface TailoredResumeRecord {
  id: string;
  userId: string;
  masterCvVersionId: string | null;
  title: string;
  targetRole: string;
  targetCompany: string;
  jobDescriptionSnapshot: string;
  resumeContent: ResumeData;
  atsScore: number | null;
  atsBreakdown: any | null;
  truthGuardResult: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveMasterCvOptions {
  title?: string;
  targetRole?: string;
  expectedRevision?: number;
  createSnapshot?: boolean;
  versionLabel?: string;
  source?: 'manual' | 'autosave' | 'restore' | 'import';
  atsScore?: number | null;
  atsBreakdown?: any | null;
}

export class MasterCvRepository {
  /**
   * Retrieve the active Master CV for a user.
   */
  static async get(userId: string, client?: PoolClient): Promise<MasterCvRecord | null> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);
      const res = await q.query(
        `SELECT id, user_id, title, content, target_role, revision, ats_score, ats_breakdown,
                ${TS_TEXT('created_at')} AS created_at,
                ${TS_TEXT('updated_at')} AS updated_at
         FROM master_cvs
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (!res.rows[0]) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
        targetRole: row.target_role,
        revision: Number(row.revision),
        atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
        atsBreakdown: typeof row.ats_breakdown === 'string' ? JSON.parse(row.ats_breakdown) : row.ats_breakdown,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * Save (create or update) the user's Master CV with optimistic revision checks and version snapshots.
   */
  static async save(
    userId: string,
    content: ResumeData,
    options: SaveMasterCvOptions = {},
    client?: PoolClient,
  ): Promise<{ masterCv: MasterCvRecord; version?: MasterCvVersionRecord }> {
    const execute = async (c: PoolClient) => {
      const q = asQueryable(c);

      // Check existing row with FOR UPDATE lock
      const existingRes = await q.query(
        `SELECT id, revision, title, target_role, ats_score, ats_breakdown
         FROM master_cvs
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );

      const existing = existingRes.rows[0];

      if (existing) {
        const currentRevision = Number(existing.revision);

        // Optimistic concurrency check
        if (options.expectedRevision !== undefined && options.expectedRevision !== currentRevision) {
          throw new AppError(
            'REVISION_CONFLICT',
            `Revision conflict: Master CV was modified elsewhere (current revision is ${currentRevision}, but expected ${options.expectedRevision}). Reload your CV before saving.`,
            409
          );
        }

        const newRevision = currentRevision + 1;
        const newTitle = options.title !== undefined ? options.title : existing.title;
        const newRole = options.targetRole !== undefined ? options.targetRole : existing.target_role;
        const newAtsScore = options.atsScore !== undefined ? options.atsScore : existing.ats_score;
        const newAtsBreakdown = options.atsBreakdown !== undefined ? options.atsBreakdown : existing.ats_breakdown;

        const updateRes = await q.query(
          `UPDATE master_cvs
           SET content = $1,
               title = $2,
               target_role = $3,
               revision = $4,
               ats_score = $5,
               ats_breakdown = $6,
               updated_at = NOW()
           WHERE user_id = $7
           RETURNING id, user_id, title, content, target_role, revision, ats_score, ats_breakdown,
                     ${TS_TEXT('created_at')} AS created_at,
                     ${TS_TEXT('updated_at')} AS updated_at`,
          [
            JSON.stringify(content),
            newTitle,
            newRole,
            newRevision,
            newAtsScore,
            newAtsBreakdown ? JSON.stringify(newAtsBreakdown) : null,
            userId,
          ]
        );

        const row = updateRes.rows[0];
        const masterCv: MasterCvRecord = {
          id: row.id,
          userId: row.user_id,
          title: row.title,
          content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
          targetRole: row.target_role,
          revision: Number(row.revision),
          atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
          atsBreakdown: typeof row.ats_breakdown === 'string' ? JSON.parse(row.ats_breakdown) : row.ats_breakdown,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        let version: MasterCvVersionRecord | undefined;
        if (options.createSnapshot) {
          const maxRes = await q.query(
            `SELECT COALESCE(MAX(version_number), 0) AS max_v
             FROM master_cv_versions
             WHERE master_cv_id = $1`,
            [masterCv.id]
          );
          const nextVersionNum = Number(maxRes.rows[0].max_v) + 1;
          const versionId = newId('mcv_ver');
          const versionLabel = options.versionLabel?.trim() || `Version ${nextVersionNum}`;
          const source = options.source || 'manual';

          const verRes = await q.query(
            `INSERT INTO master_cv_versions
               (id, master_cv_id, user_id, version_number, version_label, content_snapshot, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, master_cv_id, user_id, version_number, version_label, content_snapshot, source,
                       ${TS_TEXT('created_at')} AS created_at`,
            [
              versionId,
              masterCv.id,
              userId,
              nextVersionNum,
              versionLabel,
              JSON.stringify(content),
              source,
            ]
          );
          const vRow = verRes.rows[0];
          version = {
            id: vRow.id,
            masterCvId: vRow.master_cv_id,
            userId: vRow.user_id,
            versionNumber: Number(vRow.version_number),
            versionLabel: vRow.version_label,
            contentSnapshot: typeof vRow.content_snapshot === 'string' ? JSON.parse(vRow.content_snapshot) : vRow.content_snapshot,
            source: vRow.source,
            createdAt: vRow.created_at,
          };
        }

        return { masterCv, version };
      } else {
        // Initial creation of Master CV
        const masterId = newId('mcv');
        const title = options.title || 'Master CV';
        const role = options.targetRole || '';
        const revision = 1;

        const insertRes = await q.query(
          `INSERT INTO master_cvs
             (id, user_id, title, content, target_role, revision, ats_score, ats_breakdown)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, user_id, title, content, target_role, revision, ats_score, ats_breakdown,
                     ${TS_TEXT('created_at')} AS created_at,
                     ${TS_TEXT('updated_at')} AS updated_at`,
          [
            masterId,
            userId,
            title,
            JSON.stringify(content),
            role,
            revision,
            options.atsScore ?? null,
            options.atsBreakdown ? JSON.stringify(options.atsBreakdown) : null,
          ]
        );

        // Mark user onboarded upon initial Master CV creation
        await q.query('UPDATE users SET onboarded = TRUE WHERE id = $1', [userId]);

        const row = insertRes.rows[0];
        const masterCv: MasterCvRecord = {
          id: row.id,
          userId: row.user_id,
          title: row.title,
          content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
          targetRole: row.target_role,
          revision: Number(row.revision),
          atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
          atsBreakdown: typeof row.ats_breakdown === 'string' ? JSON.parse(row.ats_breakdown) : row.ats_breakdown,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        // Create initial immutable snapshot (Version 1)
        const versionId = newId('mcv_ver');
        const versionLabel = options.versionLabel?.trim() || 'Initial Master CV';
        const source = options.source || 'manual';

        const verRes = await q.query(
          `INSERT INTO master_cv_versions
             (id, master_cv_id, user_id, version_number, version_label, content_snapshot, source)
           VALUES ($1, $2, $3, 1, $4, $5, $6)
           RETURNING id, master_cv_id, user_id, version_number, version_label, content_snapshot, source,
                     ${TS_TEXT('created_at')} AS created_at`,
          [
            versionId,
            masterCv.id,
            userId,
            versionLabel,
            JSON.stringify(content),
            source,
          ]
        );
        const vRow = verRes.rows[0];
        const version: MasterCvVersionRecord = {
          id: vRow.id,
          masterCvId: vRow.master_cv_id,
          userId: vRow.user_id,
          versionNumber: 1,
          versionLabel: vRow.version_label,
          contentSnapshot: typeof vRow.content_snapshot === 'string' ? JSON.parse(vRow.content_snapshot) : vRow.content_snapshot,
          source: vRow.source,
          createdAt: vRow.created_at,
        };

        return { masterCv, version };
      }
    };

    if (client) {
      return execute(client);
    }
    return withUserContext(userId, execute);
  }

  /**
   * Delete Master CV and cascade delete its version history.
   */
  static async delete(userId: string, client?: PoolClient): Promise<boolean> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);
      const res = await q.query('DELETE FROM master_cvs WHERE user_id = $1', [userId]);
      return (res.rowCount ?? 0) > 0;
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * List all immutable version snapshots for a user's Master CV.
   */
  static async listVersions(userId: string, client?: PoolClient): Promise<MasterCvVersionRecord[]> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);
      const res = await q.query(
        `SELECT id, master_cv_id, user_id, version_number, version_label, content_snapshot, source,
                ${TS_TEXT('created_at')} AS created_at
         FROM master_cv_versions
         WHERE user_id = $1
         ORDER BY version_number DESC`,
        [userId]
      );
      return res.rows.map((row) => ({
        id: row.id,
        masterCvId: row.master_cv_id,
        userId: row.user_id,
        versionNumber: Number(row.version_number),
        versionLabel: row.version_label,
        contentSnapshot: typeof row.content_snapshot === 'string' ? JSON.parse(row.content_snapshot) : row.content_snapshot,
        source: row.source,
        createdAt: row.created_at,
      }));
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * Retrieve a specific Master CV version snapshot.
   */
  static async getVersion(userId: string, versionId: string, client?: PoolClient): Promise<MasterCvVersionRecord | null> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);
      const res = await q.query(
        `SELECT id, master_cv_id, user_id, version_number, version_label, content_snapshot, source,
                ${TS_TEXT('created_at')} AS created_at
         FROM master_cv_versions
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [versionId, userId]
      );
      if (!res.rows[0]) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        masterCvId: row.master_cv_id,
        userId: row.user_id,
        versionNumber: Number(row.version_number),
        versionLabel: row.version_label,
        contentSnapshot: typeof row.content_snapshot === 'string' ? JSON.parse(row.content_snapshot) : row.content_snapshot,
        source: row.source,
        createdAt: row.created_at,
      };
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * Restore a historical version snapshot as a NEW revision.
   * Does NOT mutate history or delete snapshots; records a restore event.
   */
  static async restoreVersion(
    userId: string,
    versionId: string,
    client?: PoolClient,
  ): Promise<{ masterCv: MasterCvRecord; restoredVersion: MasterCvVersionRecord }> {
    const run = async (c: PoolClient) => {
      const targetVersion = await MasterCvRepository.getVersion(userId, versionId, c);
      if (!targetVersion) {
        throw new AppError('NOT_FOUND', 'Version snapshot not found.', 404);
      }

      const label = `Restored from v${targetVersion.versionNumber}${
        targetVersion.versionLabel ? ` (${targetVersion.versionLabel})` : ''
      }`;

      const { masterCv, version } = await MasterCvRepository.save(
        userId,
        targetVersion.contentSnapshot,
        {
          createSnapshot: true,
          versionLabel: label,
          source: 'restore',
        },
        c
      );

      return { masterCv, restoredVersion: version! };
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * Create an explicit named snapshot of the current Master CV.
   */
  static async createSnapshot(
    userId: string,
    label: string,
    client?: PoolClient,
  ): Promise<MasterCvVersionRecord> {
    const run = async (c: PoolClient) => {
      const current = await MasterCvRepository.get(userId, c);
      if (!current) {
        throw new AppError('NO_MASTER_CV', 'Create your Master CV before creating a version snapshot.', 400);
      }

      const q = asQueryable(c);
      const maxRes = await q.query(
        `SELECT COALESCE(MAX(version_number), 0) AS max_v
         FROM master_cv_versions
         WHERE master_cv_id = $1`,
        [current.id]
      );
      const nextVersionNum = Number(maxRes.rows[0].max_v) + 1;
      const versionId = newId('mcv_ver');
      const versionLabel = label.trim() || `Version ${nextVersionNum}`;

      const verRes = await q.query(
        `INSERT INTO master_cv_versions
           (id, master_cv_id, user_id, version_number, version_label, content_snapshot, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual')
         RETURNING id, master_cv_id, user_id, version_number, version_label, content_snapshot, source,
                   ${TS_TEXT('created_at')} AS created_at`,
        [
          versionId,
          current.id,
          userId,
          nextVersionNum,
          versionLabel,
          JSON.stringify(current.content),
        ]
      );
      const row = verRes.rows[0];
      return {
        id: row.id,
        masterCvId: row.master_cv_id,
        userId: row.user_id,
        versionNumber: Number(row.version_number),
        versionLabel: row.version_label,
        contentSnapshot: typeof row.content_snapshot === 'string' ? JSON.parse(row.content_snapshot) : row.content_snapshot,
        source: row.source,
        createdAt: row.created_at,
      };
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  // --------------------------------------------------------------------------
  // Tailored Resumes (Independent Versions)
  // --------------------------------------------------------------------------

  /**
   * List all tailored resume versions belonging to a user.
   */
  static async listTailoredResumes(userId: string, client?: PoolClient): Promise<TailoredResumeRecord[]> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);
      const res = await q.query(
        `SELECT id, user_id, master_cv_version_id, title, target_role, target_company,
                job_description_snapshot, resume_content, ats_score, ats_breakdown, truth_guard_result,
                ${TS_TEXT('created_at')} AS created_at,
                ${TS_TEXT('updated_at')} AS updated_at
         FROM tailored_resume_versions
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [userId]
      );
      return res.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        masterCvVersionId: row.master_cv_version_id,
        title: row.title,
        targetRole: row.target_role,
        targetCompany: row.target_company,
        jobDescriptionSnapshot: row.job_description_snapshot,
        resumeContent: typeof row.resume_content === 'string' ? JSON.parse(row.resume_content) : row.resume_content,
        atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
        atsBreakdown: typeof row.ats_breakdown === 'string' ? JSON.parse(row.ats_breakdown) : row.ats_breakdown,
        truthGuardResult: typeof row.truth_guard_result === 'string' ? JSON.parse(row.truth_guard_result) : row.truth_guard_result,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * Retrieve a specific tailored resume version.
   */
  static async getTailoredResume(userId: string, id: string, client?: PoolClient): Promise<TailoredResumeRecord | null> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);
      const res = await q.query(
        `SELECT id, user_id, master_cv_version_id, title, target_role, target_company,
                job_description_snapshot, resume_content, ats_score, ats_breakdown, truth_guard_result,
                ${TS_TEXT('created_at')} AS created_at,
                ${TS_TEXT('updated_at')} AS updated_at
         FROM tailored_resume_versions
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [id, userId]
      );
      if (!res.rows[0]) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        masterCvVersionId: row.master_cv_version_id,
        title: row.title,
        targetRole: row.target_role,
        targetCompany: row.target_company,
        jobDescriptionSnapshot: row.job_description_snapshot,
        resumeContent: typeof row.resume_content === 'string' ? JSON.parse(row.resume_content) : row.resume_content,
        atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
        atsBreakdown: typeof row.ats_breakdown === 'string' ? JSON.parse(row.ats_breakdown) : row.ats_breakdown,
        truthGuardResult: typeof row.truth_guard_result === 'string' ? JSON.parse(row.truth_guard_result) : row.truth_guard_result,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * Save a tailored resume version. NEVER mutates or overwrites the Master CV.
   */
  static async saveTailoredResume(
    userId: string,
    data: {
      id?: string;
      masterCvVersionId?: string | null;
      title: string;
      targetRole?: string;
      targetCompany?: string;
      jobDescriptionSnapshot?: string;
      resumeContent: ResumeData;
      atsScore?: number | null;
      atsBreakdown?: any | null;
      truthGuardResult?: any | null;
    },
    client?: PoolClient,
  ): Promise<TailoredResumeRecord> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);

      if (data.id) {
        // Update existing tailored version
        const updateRes = await q.query(
          `UPDATE tailored_resume_versions
           SET title = $1,
               target_role = $2,
               target_company = $3,
               job_description_snapshot = $4,
               resume_content = $5,
               ats_score = $6,
               ats_breakdown = $7,
               truth_guard_result = $8,
               master_cv_version_id = COALESCE($9, master_cv_version_id),
               updated_at = NOW()
           WHERE id = $10 AND user_id = $11
           RETURNING id, user_id, master_cv_version_id, title, target_role, target_company,
                     job_description_snapshot, resume_content, ats_score, ats_breakdown, truth_guard_result,
                     ${TS_TEXT('created_at')} AS created_at,
                     ${TS_TEXT('updated_at')} AS updated_at`,
          [
            data.title,
            data.targetRole || '',
            data.targetCompany || '',
            data.jobDescriptionSnapshot || '',
            JSON.stringify(data.resumeContent),
            data.atsScore ?? null,
            data.atsBreakdown ? JSON.stringify(data.atsBreakdown) : null,
            data.truthGuardResult ? JSON.stringify(data.truthGuardResult) : null,
            data.masterCvVersionId ?? null,
            data.id,
            userId,
          ]
        );

        if (!updateRes.rows[0]) {
          throw new AppError('NOT_FOUND', 'Tailored resume not found.', 404);
        }

        const row = updateRes.rows[0];
        return {
          id: row.id,
          userId: row.user_id,
          masterCvVersionId: row.master_cv_version_id,
          title: row.title,
          targetRole: row.target_role,
          targetCompany: row.target_company,
          jobDescriptionSnapshot: row.job_description_snapshot,
          resumeContent: typeof row.resume_content === 'string' ? JSON.parse(row.resume_content) : row.resume_content,
          atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
          atsBreakdown: typeof row.ats_breakdown === 'string' ? JSON.parse(row.ats_breakdown) : row.ats_breakdown,
          truthGuardResult: typeof row.truth_guard_result === 'string' ? JSON.parse(row.truth_guard_result) : row.truth_guard_result,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }

      // Create new tailored version
      const id = newId('tres');
      const insertRes = await q.query(
        `INSERT INTO tailored_resume_versions
           (id, user_id, master_cv_version_id, title, target_role, target_company,
            job_description_snapshot, resume_content, ats_score, ats_breakdown, truth_guard_result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, user_id, master_cv_version_id, title, target_role, target_company,
                   job_description_snapshot, resume_content, ats_score, ats_breakdown, truth_guard_result,
                   ${TS_TEXT('created_at')} AS created_at,
                   ${TS_TEXT('updated_at')} AS updated_at`,
        [
          id,
          userId,
          data.masterCvVersionId ?? null,
          data.title,
          data.targetRole || '',
          data.targetCompany || '',
          data.jobDescriptionSnapshot || '',
          JSON.stringify(data.resumeContent),
          data.atsScore ?? null,
          data.atsBreakdown ? JSON.stringify(data.atsBreakdown) : null,
          data.truthGuardResult ? JSON.stringify(data.truthGuardResult) : null,
        ]
      );

      const row = insertRes.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        masterCvVersionId: row.master_cv_version_id,
        title: row.title,
        targetRole: row.target_role,
        targetCompany: row.target_company,
        jobDescriptionSnapshot: row.job_description_snapshot,
        resumeContent: typeof row.resume_content === 'string' ? JSON.parse(row.resume_content) : row.resume_content,
        atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
        atsBreakdown: typeof row.ats_breakdown === 'string' ? JSON.parse(row.ats_breakdown) : row.ats_breakdown,
        truthGuardResult: typeof row.truth_guard_result === 'string' ? JSON.parse(row.truth_guard_result) : row.truth_guard_result,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }

  /**
   * Delete a tailored resume version.
   */
  static async deleteTailoredResume(userId: string, id: string, client?: PoolClient): Promise<boolean> {
    const run = async (c: PoolClient) => {
      const q = asQueryable(c);
      const res = await q.query(
        'DELETE FROM tailored_resume_versions WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return (res.rowCount ?? 0) > 0;
    };

    if (client) {
      return run(client);
    }
    return withUserContext(userId, run);
  }
}
