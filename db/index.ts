import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/kyc.db';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf-8');
    db.exec(schema);
  }
  return db;
}

// ---- Link helpers ----

export function createLink(params: {
  id: string;
  token: string;
  investorName: string;
  investorType: 'individual' | 'corporate';
  investorEmail?: string;
  expiresAt: string;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO links (id, token, investor_name, investor_type, investor_email, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(params.id, params.token, params.investorName, params.investorType, params.investorEmail || null, params.expiresAt);
}

export function getLinkByToken(token: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM links WHERE token = ?').get(token) as LinkRow | undefined;
}

export function getLinkById(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM links WHERE id = ?').get(id) as LinkRow | undefined;
}

export function getAllLinks() {
  const db = getDb();
  return db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM submissions s WHERE s.link_id = l.id) as submission_count,
      (SELECT s.status FROM submissions s WHERE s.link_id = l.id ORDER BY s.updated_at DESC LIMIT 1) as latest_status,
      (SELECT s.drive_sync_status FROM submissions s WHERE s.link_id = l.id ORDER BY s.updated_at DESC LIMIT 1) as latest_sync_status
    FROM links l ORDER BY l.created_at DESC
  `).all() as (LinkRow & { submission_count: number; latest_status: string | null; latest_sync_status: string | null })[];
}

export function revokeLink(id: string) {
  const db = getDb();
  return db.prepare('UPDATE links SET is_revoked = 1 WHERE id = ?').run(id);
}

// ---- Session helpers ----

export function createSession(params: {
  id: string;
  linkId: string;
  email: string;
  sessionToken: string;
  expiresAt: string;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO sessions (id, link_id, email, session_token, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.id, params.linkId, params.email, params.sessionToken, params.expiresAt);
}

export function getSessionByToken(sessionToken: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE session_token = ?').get(sessionToken) as SessionRow | undefined;
}

// ---- Verification code helpers ----

export function createVerificationCode(params: {
  id: string;
  linkId: string;
  email: string;
  code: string;
  expiresAt: string;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO verification_codes (id, link_id, email, code, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.id, params.linkId, params.email, params.code, params.expiresAt);
}

export function getVerificationCode(linkId: string, email: string, code: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM verification_codes
    WHERE link_id = ? AND email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(linkId, email, code) as VerificationCodeRow | undefined;
}

export function markCodeUsed(id: string) {
  const db = getDb();
  return db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(id);
}

// ---- Submission helpers ----

export function getOrCreateSubmission(linkId: string, email: string): SubmissionRow {
  const db = getDb();
  const existing = db.prepare(`
    SELECT * FROM submissions WHERE link_id = ? AND email = ? AND status = 'draft'
    ORDER BY updated_at DESC LIMIT 1
  `).get(linkId, email) as SubmissionRow | undefined;

  if (existing) return existing;

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO submissions (id, link_id, email) VALUES (?, ?, ?)
  `).run(id, linkId, email);

  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as SubmissionRow;
}

export function updateSubmissionFormData(id: string, formData: string) {
  const db = getDb();
  return db.prepare(`
    UPDATE submissions SET form_data = ?, updated_at = datetime('now') WHERE id = ?
  `).run(formData, id);
}

export function finalizeSubmission(id: string) {
  const db = getDb();
  return db.prepare(`
    UPDATE submissions SET status = 'finalized', finalized_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(id);
}

export function getSubmissionById(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as SubmissionRow | undefined;
}

export function getSubmissionsByLinkId(linkId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM submissions WHERE link_id = ? ORDER BY updated_at DESC').all(linkId) as SubmissionRow[];
}

export function updateSubmissionSyncStatus(id: string, status: string, error?: string) {
  const db = getDb();
  return db.prepare(`
    UPDATE submissions SET drive_sync_status = ?, drive_sync_error = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, error || null, id);
}

// ---- File helpers ----

export function createUploadedFile(params: {
  id: string;
  linkId: string;
  submissionId?: string;
  documentType: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO uploaded_files (id, link_id, submission_id, document_type, original_name, stored_path, mime_type, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(params.id, params.linkId, params.submissionId || null, params.documentType, params.originalName, params.storedPath, params.mimeType, params.fileSize);
}

export function getFilesByLinkId(linkId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM uploaded_files WHERE link_id = ? ORDER BY uploaded_at DESC').all(linkId) as UploadedFileRow[];
}

export function getFileById(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(id) as UploadedFileRow | undefined;
}

export function deleteFileById(id: string) {
  const db = getDb();
  return db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(id);
}

export function updateFileSyncStatus(id: string, status: string, driveFileId?: string) {
  const db = getDb();
  return db.prepare(`
    UPDATE uploaded_files SET drive_sync_status = ?, drive_file_id = ? WHERE id = ?
  `).run(status, driveFileId || null, id);
}

// ---- Admin helpers ----

export function getAdminByUsername(username: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as AdminUserRow | undefined;
}

export function createAdminUser(params: { id: string; username: string; passwordHash: string }) {
  const db = getDb();
  return db.prepare('INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)').run(params.id, params.username, params.passwordHash);
}

// ---- Contract template helpers ----

export function createContractTemplate(params: {
  id: string;
  name: string;
  investorType: 'individual' | 'corporate';
  filePath: string;
  fileType: 'pdf' | 'docx';
  originalName: string;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO contract_templates (id, name, investor_type, file_path, file_type, original_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(params.id, params.name, params.investorType, params.filePath, params.fileType, params.originalName);
}

export function getAllContractTemplates() {
  const db = getDb();
  return db.prepare('SELECT * FROM contract_templates ORDER BY created_at DESC').all() as ContractTemplateRow[];
}

export function getContractTemplateById(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(id) as ContractTemplateRow | undefined;
}

export function deleteContractTemplate(id: string) {
  const db = getDb();
  return db.prepare('DELETE FROM contract_templates WHERE id = ?').run(id);
}

export function createFieldMapping(params: {
  id: string;
  templateId: string;
  placeholder: string;
  formField: string;
  description?: string;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO template_field_mappings (id, template_id, placeholder, form_field, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.id, params.templateId, params.placeholder, params.formField, params.description || null);
}

export function getFieldMappingsByTemplateId(templateId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM template_field_mappings WHERE template_id = ?').all(templateId) as FieldMappingRow[];
}

export function deleteFieldMappingsByTemplateId(templateId: string) {
  const db = getDb();
  return db.prepare('DELETE FROM template_field_mappings WHERE template_id = ?').run(templateId);
}

// ---- Row types ----

export interface LinkRow {
  id: string;
  token: string;
  investor_name: string;
  investor_type: 'individual' | 'corporate';
  investor_email: string | null;
  expires_at: string;
  created_at: string;
  is_revoked: number;
}

export interface SessionRow {
  id: string;
  link_id: string;
  email: string;
  session_token: string;
  created_at: string;
  expires_at: string;
}

export interface VerificationCodeRow {
  id: string;
  link_id: string;
  email: string;
  code: string;
  created_at: string;
  expires_at: string;
  used: number;
}

export interface SubmissionRow {
  id: string;
  link_id: string;
  email: string;
  form_data: string;
  status: 'draft' | 'finalized';
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  drive_sync_status: string;
  drive_sync_error: string | null;
}

export interface UploadedFileRow {
  id: string;
  link_id: string;
  submission_id: string | null;
  document_type: string;
  original_name: string;
  stored_path: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  drive_sync_status: string;
  drive_file_id: string | null;
}

export interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface ContractTemplateRow {
  id: string;
  name: string;
  investor_type: 'individual' | 'corporate';
  file_path: string;
  file_type: 'pdf' | 'docx';
  original_name: string;
  created_at: string;
  updated_at: string;
}

export interface FieldMappingRow {
  id: string;
  template_id: string;
  placeholder: string;
  form_field: string;
  description: string | null;
}
