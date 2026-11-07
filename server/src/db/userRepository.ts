// Curevo AI — User & Profile Repository (Data Access Layer)
//
// Encapsulates database queries for user identity, authentication credentials,
// email verification status, and profile updates.

import { getDb, newId, asQueryable, TS_TEXT } from './db';
import type { PoolClient } from 'pg';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  targetRole: string;
  onboarded: boolean;
  emailVerified: boolean;
  role: string;
  templateId: string;
  sessionVersion: number;
  createdAt: string;
}

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  targetRole?: string;
}

export class UserRepository {
  /** Create a new user record. */
  static async create(data: CreateUserData, client?: PoolClient): Promise<UserRecord> {
    const q = client ? asQueryable(client) : getDb();
    const id = newId('usr');
    const res = await q.query(
      `INSERT INTO users (id, email, password_hash, name, target_role, session_version)
       VALUES ($1, $2, $3, $4, $5, 0)
       RETURNING id, email, password_hash, name, target_role, onboarded, email_verified, role, template_id, session_version, ${TS_TEXT('created_at')} AS created_at`,
      [id, data.email, data.passwordHash, data.name, data.targetRole || '']
    );
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      targetRole: row.target_role,
      onboarded: Boolean(row.onboarded),
      emailVerified: Boolean(row.email_verified),
      role: row.role,
      templateId: row.template_id,
      sessionVersion: Number(row.session_version),
      createdAt: row.created_at,
    };
  }

  /** Look up a user by email (case-insensitive). */
  static async findByEmail(email: string): Promise<UserRecord | null> {
    const db = getDb();
    const res = await db.query(
      `SELECT id, email, password_hash, name, target_role, onboarded, email_verified, role, template_id, session_version, ${TS_TEXT('created_at')} AS created_at
       FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      targetRole: row.target_role,
      onboarded: Boolean(row.onboarded),
      emailVerified: Boolean(row.email_verified),
      role: row.role,
      templateId: row.template_id,
      sessionVersion: Number(row.session_version),
      createdAt: row.created_at,
    };
  }

  /** Look up a user by id. */
  static async findById(id: string): Promise<UserRecord | null> {
    const db = getDb();
    const res = await db.query(
      `SELECT id, email, password_hash, name, target_role, onboarded, email_verified, role, template_id, session_version, ${TS_TEXT('created_at')} AS created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      targetRole: row.target_role,
      onboarded: Boolean(row.onboarded),
      emailVerified: Boolean(row.email_verified),
      role: row.role,
      templateId: row.template_id,
      sessionVersion: Number(row.session_version),
      createdAt: row.created_at,
    };
  }

  /** Update profile name and targetRole. */
  static async updateProfile(id: string, updates: { name?: string; targetRole?: string }): Promise<boolean> {
    const db = getDb();
    const res = await db.query(
      'UPDATE users SET name = COALESCE($1, name), target_role = COALESCE($2, target_role) WHERE id = $3',
      [updates.name ?? null, updates.targetRole ?? null, id]
    );
    return (res.rowCount || 0) > 0;
  }

  /** Update password hash. */
  static async updatePassword(id: string, passwordHash: string, client?: PoolClient): Promise<boolean> {
    const q = client ? asQueryable(client) : getDb();
    const res = await q.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    return (res.rowCount || 0) > 0;
  }

  /** Mark email address verified. */
  static async markEmailVerified(id: string): Promise<boolean> {
    const db = getDb();
    const res = await db.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }

  /** Delete account (cascade-deletes all child sessions, tokens, resumes). */
  static async delete(id: string): Promise<boolean> {
    const db = getDb();
    const res = await db.query('DELETE FROM users WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }
}
