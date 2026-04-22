import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/kyc.db';

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS links (
    id              TEXT PRIMARY KEY,
    token           TEXT UNIQUE NOT NULL,
    investor_name   TEXT NOT NULL,
    first_name      TEXT,
    last_name       TEXT,
    share_class     TEXT,
    sequence_number INTEGER,
    investor_type   TEXT NOT NULL CHECK(investor_type IN ('individual', 'corporate')),
    investor_email  TEXT,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    is_revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    link_id         TEXT NOT NULL REFERENCES links(id),
    email           TEXT NOT NULL,
    session_token   TEXT UNIQUE NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verification_codes (
    id              TEXT PRIMARY KEY,
    link_id         TEXT NOT NULL REFERENCES links(id),
    email           TEXT NOT NULL,
    code            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT NOT NULL,
    used            INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS submissions (
    id              TEXT PRIMARY KEY,
    link_id         TEXT NOT NULL REFERENCES links(id),
    email           TEXT NOT NULL,
    form_data       TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft', 'finalized')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at    TEXT,
    drive_sync_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK(drive_sync_status IN ('pending', 'syncing', 'synced', 'failed')),
    drive_sync_error TEXT
);
CREATE TABLE IF NOT EXISTS uploaded_files (
    id              TEXT PRIMARY KEY,
    link_id         TEXT NOT NULL REFERENCES links(id),
    submission_id   TEXT REFERENCES submissions(id),
    document_type   TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    display_name    TEXT,
    stored_path     TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    file_size       INTEGER NOT NULL,
    uploaded_at     TEXT NOT NULL DEFAULT (datetime('now')),
    drive_sync_status TEXT NOT NULL DEFAULT 'pending',
    drive_file_id   TEXT,
    address_verification TEXT
);
CREATE TABLE IF NOT EXISTS admin_users (
    id              TEXT PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contract_templates (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'other',
    investor_type   TEXT NOT NULL CHECK(investor_type IN ('individual', 'corporate')),
    file_path       TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK(file_type IN ('pdf', 'docx')),
    original_name   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS template_field_mappings (
    id              TEXT PRIMARY KEY,
    template_id     TEXT NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
    placeholder     TEXT NOT NULL,
    form_field      TEXT NOT NULL,
    description     TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_token ON links(token);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_submissions_link_id ON submissions(link_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_link_id ON uploaded_files(link_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_submission_id ON uploaded_files(submission_id);
CREATE TABLE IF NOT EXISTS submission_versions (
    id              TEXT PRIMARY KEY,
    submission_id   TEXT NOT NULL REFERENCES submissions(id),
    version_number  INTEGER NOT NULL,
    form_data       TEXT NOT NULL,
    file_ids        TEXT NOT NULL DEFAULT '[]',
    submitted_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submission_versions_submission_id ON submission_versions(submission_id);
CREATE TABLE IF NOT EXISTS email_templates (
    id              TEXT PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    subject         TEXT NOT NULL,
    body_html       TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_links_investor_email ON links(investor_email);
CREATE TABLE IF NOT EXISTS share_class_documents (
    id              TEXT PRIMARY KEY,
    share_class     TEXT NOT NULL,
    name            TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    file_size       INTEGER NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_share_class_documents_class ON share_class_documents(share_class);
CREATE TABLE IF NOT EXISTS investors (
    id              TEXT PRIMARY KEY,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT,
    investor_type   TEXT NOT NULL DEFAULT 'individual',
    share_class     TEXT,
    drive_folder_id TEXT UNIQUE,
    drive_folder_name TEXT,
    drive_folder_url TEXT,
    source          TEXT NOT NULL DEFAULT 'portal',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_investors_drive_folder ON investors(drive_folder_id);
CREATE TABLE IF NOT EXISTS link_views (
    admin_email     TEXT NOT NULL,
    link_id         TEXT NOT NULL REFERENCES links(id),
    last_viewed_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (admin_email, link_id)
);
CREATE TABLE IF NOT EXISTS link_events (
    id              TEXT PRIMARY KEY,
    link_id         TEXT NOT NULL REFERENCES links(id),
    event_type      TEXT NOT NULL,
    details         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_link_events_link_id ON link_events(link_id);
`;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    runMigrations(db);
    seedDefaultEmailTemplates(db);
  }
  return db;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some(r => r.name === column);
}

function runMigrations(db: Database.Database) {
  // links table
  if (!columnExists(db, 'links', 'first_name')) db.exec(`ALTER TABLE links ADD COLUMN first_name TEXT`);
  if (!columnExists(db, 'links', 'last_name')) db.exec(`ALTER TABLE links ADD COLUMN last_name TEXT`);
  if (!columnExists(db, 'links', 'share_class')) db.exec(`ALTER TABLE links ADD COLUMN share_class TEXT`);
  if (!columnExists(db, 'links', 'drive_folder_id')) db.exec(`ALTER TABLE links ADD COLUMN drive_folder_id TEXT`);
  if (!columnExists(db, 'links', 'sequence_number')) {
    db.exec(`ALTER TABLE links ADD COLUMN sequence_number INTEGER`);
    // Backfill: assign sequence numbers to existing rows by created_at order
    const rows = db.prepare(`SELECT id FROM links ORDER BY created_at ASC`).all() as { id: string }[];
    const update = db.prepare(`UPDATE links SET sequence_number = ? WHERE id = ?`);
    rows.forEach((row, i) => update.run(i + 1, row.id));
  }

  // uploaded_files table
  if (!columnExists(db, 'uploaded_files', 'display_name')) {
    db.exec(`ALTER TABLE uploaded_files ADD COLUMN display_name TEXT`);
  }
  if (!columnExists(db, 'uploaded_files', 'address_verification')) {
    db.exec(`ALTER TABLE uploaded_files ADD COLUMN address_verification TEXT`);
  }

  // contract_templates table
  if (!columnExists(db, 'contract_templates', 'kind')) {
    db.exec(`ALTER TABLE contract_templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'`);
  }

  // links — target subscription date & amount (admin-editable, synced from form)
  if (!columnExists(db, 'links', 'target_subscription_date')) {
    db.exec(`ALTER TABLE links ADD COLUMN target_subscription_date TEXT`);
  }
  if (!columnExists(db, 'links', 'subscription_amount')) {
    db.exec(`ALTER TABLE links ADD COLUMN subscription_amount TEXT`);
  }

  // links — link category (new_subscription vs topup)
  if (!columnExists(db, 'links', 'link_category')) {
    db.exec(`ALTER TABLE links ADD COLUMN link_category TEXT NOT NULL DEFAULT 'new_subscription'`);
  }

  // share_class_documents — description column
  if (columnExists(db, 'share_class_documents', 'id') && !columnExists(db, 'share_class_documents', 'description')) {
    db.exec(`ALTER TABLE share_class_documents ADD COLUMN description TEXT`);
  }

  // Backfill target_subscription_date and subscription_amount from existing form_data
  const unfilled = db.prepare(`
    SELECT l.id, s.form_data FROM links l
    JOIN submissions s ON s.link_id = l.id
    WHERE (l.target_subscription_date IS NULL OR l.subscription_amount IS NULL)
      AND s.form_data != '{}'
    ORDER BY s.updated_at DESC
  `).all() as { id: string; form_data: string }[];
  const seen = new Set<string>();
  const backfill = db.prepare(`UPDATE links SET target_subscription_date = COALESCE(target_subscription_date, ?), subscription_amount = COALESCE(subscription_amount, ?) WHERE id = ?`);
  for (const row of unfilled) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    try {
      const fd = JSON.parse(row.form_data);
      const d = typeof fd.subscriptionDate === 'string' ? fd.subscriptionDate : null;
      const a = typeof fd.subscriptionAmount === 'string' ? fd.subscriptionAmount : null;
      if (d || a) backfill.run(d, a, row.id);
    } catch { /* skip malformed JSON */ }
  }
}

function seedDefaultEmailTemplates(db: Database.Database) {
  // Top-up invitation template
  const topupExists = db.prepare('SELECT id FROM email_templates WHERE name = ?').get('topup_invitation');
  if (!topupExists) {
    db.prepare(`INSERT INTO email_templates (id, name, subject, body_html) VALUES (?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      'topup_invitation',
      'Capella Alpha Fund - Top-up Subscription / 奕卓資本 - 追加投资',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Capella Alpha Fund / 奕卓資本</h2>
  <p>Dear {{investorName}},</p>
  <p>Thank you for your continued investment. To process your top-up subscription, please complete the form below with your subscription details and payment proof.</p>
  <p>感谢您的持续投资。请通过以下链接填写追加投资信息并上传付款证明。</p>
  <div style="margin: 20px 0; text-align: center;">
    <a href="{{link}}" style="background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Submit Top-up / 提交追加投资</a>
  </div>
  <p style="word-break: break-all; font-size: 12px; color: #666;">{{link}}</p>
  <p><strong>Important / 重要提醒:</strong> Please ensure the remitting bank account is the same as your initial subscription. If using a different account, please contact the fund operations team.<br/>请确保汇款银行账户与首次认购时使用的账户一致。如使用不同账户，请联系基金运营部门。</p>
  <p>This link will expire on {{expiresAt}}. / 此链接将于 {{expiresAt}} 过期。</p>
  <hr style="margin: 20px 0;" />
  <p style="color: #888; font-size: 12px;">Capella Capital Limited / 奕卓資本有限公司</p>
</div>`
    );
  }

  const existing = db.prepare('SELECT id FROM email_templates WHERE name = ?').get('investor_invitation');
  if (!existing) {
    db.prepare(`
      INSERT INTO email_templates (id, name, subject, body_html)
      VALUES (?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      'investor_invitation',
      'Capella Alpha Fund - Investor Information Collection / 奕卓資本 - 投资者信息收集',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Capella Alpha Fund / 奕卓資本</h2>
  <p>Dear {{investorName}},</p>
  <p>We kindly invite you to complete your investor information form. Please click the link below to access your personalized submission page:</p>
  <p>我们诚邀您填写投资者信息表。请点击以下链接访问您的专属页面：</p>
  <div style="margin: 20px 0; text-align: center;">
    <a href="{{link}}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Access Form / 访问表单</a>
  </div>
  <p style="word-break: break-all; font-size: 12px; color: #666;">{{link}}</p>
  <p>This link will expire on {{expiresAt}}. / 此链接将于 {{expiresAt}} 过期。</p>
  <hr style="margin: 20px 0;" />
  <p style="color: #888; font-size: 12px;">Capella Capital Limited / 奕卓資本有限公司</p>
</div>`
    );
  }
}

// ---- Link helpers ----

export function createLink(params: {
  id: string;
  token: string;
  investorName: string;
  firstName?: string;
  lastName?: string;
  shareClass?: string;
  investorType: 'individual' | 'corporate';
  investorEmail?: string;
  expiresAt: string;
  linkCategory?: 'new_subscription' | 'topup';
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO links (id, token, investor_name, first_name, last_name, share_class, investor_type, investor_email, expires_at, link_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.id,
    params.token,
    params.investorName,
    params.firstName || null,
    params.lastName || null,
    params.shareClass || null,
    params.investorType,
    params.investorEmail?.toLowerCase() || null,
    params.expiresAt,
    params.linkCategory || 'new_subscription'
  );
}

/**
 * Returns the smallest positive sequence number not currently used by any link.
 * Fills gaps left by deleted entries so numbering stays dense.
 */
export function suggestNextSequence(): number {
  const db = getDb();
  const rows = db.prepare(`
    SELECT sequence_number FROM links
    WHERE sequence_number IS NOT NULL AND sequence_number > 0
    ORDER BY sequence_number ASC
  `).all() as { sequence_number: number }[];
  let expected = 1;
  for (const row of rows) {
    if (row.sequence_number > expected) return expected;
    if (row.sequence_number === expected) expected++;
  }
  return expected;
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

/**
 * Fully removes a link and everything attached to it (submissions, versions,
 * files, sessions, codes). Returns the disk paths of uploaded files so the
 * caller can unlink them from storage.
 */
export function deleteLink(id: string): string[] {
  const db = getDb();
  const filePaths = (db.prepare('SELECT stored_path FROM uploaded_files WHERE link_id = ?').all(id) as { stored_path: string }[])
    .map(r => r.stored_path);
  const submissionIds = (db.prepare('SELECT id FROM submissions WHERE link_id = ?').all(id) as { id: string }[])
    .map(r => r.id);

  const tx = db.transaction(() => {
    for (const sid of submissionIds) {
      db.prepare('DELETE FROM submission_versions WHERE submission_id = ?').run(sid);
    }
    db.prepare('DELETE FROM uploaded_files WHERE link_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE link_id = ?').run(id);
    db.prepare('DELETE FROM verification_codes WHERE link_id = ?').run(id);
    db.prepare('DELETE FROM submissions WHERE link_id = ?').run(id);
    db.prepare('DELETE FROM links WHERE id = ?').run(id);
  });
  tx();

  return filePaths;
}

// ---- Link event helpers ----

export function logLinkEvent(linkId: string, eventType: string, details?: Record<string, unknown>) {
  try {
    const db = getDb();
    db.prepare(`INSERT INTO link_events (id, link_id, event_type, details) VALUES (?, ?, ?, ?)`)
      .run(crypto.randomUUID(), linkId, eventType, details ? JSON.stringify(details) : null);
  } catch (err) {
    console.error(`[logLinkEvent] failed to log ${eventType} for ${linkId}:`, err);
  }
}

export function getLinkEvents(linkId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM link_events WHERE link_id = ? ORDER BY created_at DESC').all(linkId) as LinkEventRow[];
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
  // Find any existing submission for this link+email (draft or finalized — allow re-editing)
  const existing = db.prepare(`
    SELECT * FROM submissions WHERE link_id = ? AND email = ?
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

// ---- Submission version helpers ----

export function createSubmissionVersion(params: {
  submissionId: string;
  formData: string;
  fileIds: string[];
}) {
  const db = getDb();
  const latest = db.prepare(`
    SELECT MAX(version_number) as max_version FROM submission_versions WHERE submission_id = ?
  `).get(params.submissionId) as { max_version: number | null };

  const versionNumber = (latest?.max_version || 0) + 1;
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO submission_versions (id, submission_id, version_number, form_data, file_ids)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, params.submissionId, versionNumber, params.formData, JSON.stringify(params.fileIds));

  return { id, versionNumber };
}

export function getSubmissionVersions(submissionId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM submission_versions WHERE submission_id = ? ORDER BY version_number DESC
  `).all(submissionId) as SubmissionVersionRow[];
}

export function getLatestSubmissionVersion(submissionId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM submission_versions WHERE submission_id = ? ORDER BY version_number DESC LIMIT 1
  `).get(submissionId) as SubmissionVersionRow | undefined;
}

// ---- File helpers ----

export function createUploadedFile(params: {
  id: string;
  linkId: string;
  submissionId?: string;
  documentType: string;
  originalName: string;
  displayName?: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO uploaded_files (id, link_id, submission_id, document_type, original_name, display_name, stored_path, mime_type, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.id,
    params.linkId,
    params.submissionId || null,
    params.documentType,
    params.originalName,
    params.displayName || null,
    params.storedPath,
    params.mimeType,
    params.fileSize
  );
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

export function resetFileSyncStatusForLink(linkId: string) {
  const db = getDb();
  return db.prepare(`UPDATE uploaded_files SET drive_sync_status = 'pending', drive_file_id = NULL WHERE link_id = ?`).run(linkId);
}

export function setLinkDriveFolderId(linkId: string, folderId: string) {
  const db = getDb();
  return db.prepare(`UPDATE links SET drive_folder_id = ? WHERE id = ?`).run(folderId, linkId);
}

export function updateLink(id: string, params: {
  firstName?: string;
  lastName?: string;
  shareClass?: string | null;
  investorEmail?: string | null;
  targetSubscriptionDate?: string | null;
  subscriptionAmount?: string | null;
}) {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (params.firstName !== undefined) { sets.push('first_name = ?'); values.push(params.firstName || null); }
  if (params.lastName !== undefined) { sets.push('last_name = ?'); values.push(params.lastName || null); }
  if (params.shareClass !== undefined) { sets.push('share_class = ?'); values.push(params.shareClass || null); }
  if (params.investorEmail !== undefined) {
    sets.push('investor_email = ?');
    values.push(params.investorEmail ? params.investorEmail.toLowerCase() : null);
  }
  if (params.targetSubscriptionDate !== undefined) { sets.push('target_subscription_date = ?'); values.push(params.targetSubscriptionDate || null); }
  if (params.subscriptionAmount !== undefined) { sets.push('subscription_amount = ?'); values.push(params.subscriptionAmount || null); }

  if (sets.length === 0) return;

  // Also update investor_name if either name field is provided
  if (params.firstName !== undefined || params.lastName !== undefined) {
    const current = db.prepare('SELECT first_name, last_name FROM links WHERE id = ?').get(id) as { first_name: string | null; last_name: string | null };
    const fn = params.firstName ?? current?.first_name ?? '';
    const ln = params.lastName ?? current?.last_name ?? '';
    if (fn || ln) {
      sets.push('investor_name = ?');
      values.push(`${fn} ${ln}`.trim());
    }
  }

  values.push(id);
  return db.prepare(`UPDATE links SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function getDistinctInvestors() {
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT first_name, last_name, investor_name, investor_type, investor_email, share_class, drive_folder_id
    FROM links
    WHERE link_category = 'new_subscription' AND first_name IS NOT NULL AND last_name IS NOT NULL
    ORDER BY investor_name ASC
  `).all() as { first_name: string; last_name: string; investor_name: string; investor_type: string; investor_email: string | null; share_class: string | null; drive_folder_id: string | null }[];
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
  kind?: string;
  investorType: 'individual' | 'corporate';
  filePath: string;
  fileType: 'pdf' | 'docx';
  originalName: string;
}) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO contract_templates (id, name, kind, investor_type, file_path, file_type, original_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.id,
    params.name,
    params.kind || 'other',
    params.investorType,
    params.filePath,
    params.fileType,
    params.originalName
  );
}

export function getTemplatesByLinkAndKind(investorType: 'individual' | 'corporate', kind: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM contract_templates WHERE investor_type = ? AND kind = ?
    ORDER BY created_at DESC
  `).all(investorType, kind) as ContractTemplateRow[];
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

// ---- Email template helpers ----

export function getEmailTemplate(name: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM email_templates WHERE name = ?').get(name) as EmailTemplateRow | undefined;
}

export function upsertEmailTemplate(params: { name: string; subject: string; bodyHtml: string }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM email_templates WHERE name = ?').get(params.name) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE email_templates SET subject = ?, body_html = ?, updated_at = datetime('now') WHERE name = ?`)
      .run(params.subject, params.bodyHtml, params.name);
  } else {
    db.prepare(`INSERT INTO email_templates (id, name, subject, body_html) VALUES (?, ?, ?, ?)`)
      .run(crypto.randomUUID(), params.name, params.subject, params.bodyHtml);
  }
}

// ---- Link-by-email helpers ----

export function getLinksByEmail(email: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM links
    WHERE investor_email = ? AND is_revoked = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `).all(email.toLowerCase()) as LinkRow[];
}

// ---- Row types ----

export interface LinkRow {
  id: string;
  token: string;
  investor_name: string;
  first_name: string | null;
  last_name: string | null;
  share_class: string | null;
  sequence_number: number | null;
  investor_type: 'individual' | 'corporate';
  investor_email: string | null;
  expires_at: string;
  created_at: string;
  is_revoked: number;
  drive_folder_id: string | null;
  target_subscription_date: string | null;
  subscription_amount: string | null;
  link_category: 'new_subscription' | 'topup';
}

export interface LinkEventRow {
  id: string;
  link_id: string;
  event_type: string;
  details: string | null;
  created_at: string;
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
  display_name: string | null;
  stored_path: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
  drive_sync_status: string;
  drive_file_id: string | null;
  address_verification: string | null;
}

export interface AddressVerification {
  status: 'pending' | 'matched' | 'mismatched' | 'failed' | 'skipped';
  user_address: string;
  extracted_address: string;
  reason: string;
  checked_at: string;
}

export function updateAddressVerification(fileId: string, verification: AddressVerification) {
  const db = getDb();
  return db.prepare(`UPDATE uploaded_files SET address_verification = ? WHERE id = ?`)
    .run(JSON.stringify(verification), fileId);
}

export function getLatestAddressProofFile(linkId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM uploaded_files
    WHERE link_id = ? AND document_type = 'address_proof'
    ORDER BY uploaded_at DESC LIMIT 1
  `).get(linkId) as UploadedFileRow | undefined;
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
  kind: string;
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

// ---- Share-class document helpers ----

export interface ShareClassDocumentRow {
  id: string;
  share_class: string;
  name: string;
  description: string | null;
  file_path: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  sort_order: number;
  created_at: string;
}

export function getShareClassDocuments(shareClass: string): ShareClassDocumentRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM share_class_documents WHERE share_class = ? ORDER BY sort_order ASC, created_at ASC').all(shareClass) as ShareClassDocumentRow[];
}

export function getAllShareClassDocuments(): ShareClassDocumentRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM share_class_documents ORDER BY share_class ASC, sort_order ASC').all() as ShareClassDocumentRow[];
}

export function getShareClassDocumentById(id: string): ShareClassDocumentRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM share_class_documents WHERE id = ?').get(id) as ShareClassDocumentRow | undefined;
}

export function createShareClassDocument(params: {
  id: string;
  shareClass: string;
  name: string;
  description?: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  sortOrder?: number;
}) {
  const db = getDb();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM share_class_documents WHERE share_class = ?').get(params.shareClass) as { next: number };
  db.prepare(`INSERT INTO share_class_documents (id, share_class, name, description, file_path, original_name, mime_type, file_size, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    params.id, params.shareClass, params.name, params.description || null, params.filePath, params.originalName, params.mimeType, params.fileSize, params.sortOrder ?? maxOrder.next
  );
}

export function updateShareClassDocument(id: string, params: { name?: string; description?: string | null; sortOrder?: number }) {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (params.name !== undefined) { sets.push('name = ?'); values.push(params.name); }
  if (params.description !== undefined) { sets.push('description = ?'); values.push(params.description); }
  if (params.sortOrder !== undefined) { sets.push('sort_order = ?'); values.push(params.sortOrder); }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE share_class_documents SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteShareClassDocument(id: string): string | null {
  const db = getDb();
  const doc = db.prepare('SELECT file_path FROM share_class_documents WHERE id = ?').get(id) as { file_path: string } | undefined;
  if (!doc) return null;
  db.prepare('DELETE FROM share_class_documents WHERE id = ?').run(id);
  return doc.file_path;
}

export interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

export interface SubmissionVersionRow {
  id: string;
  submission_id: string;
  version_number: number;
  form_data: string;
  file_ids: string;
  submitted_at: string;
}

// ---- Link view tracking ----

export function markLinkViewed(adminEmail: string, linkId: string) {
  const db = getDb();
  db.prepare(`INSERT INTO link_views (admin_email, link_id, last_viewed_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(admin_email, link_id) DO UPDATE SET last_viewed_at = datetime('now')`)
    .run(adminEmail, linkId);
}

export function getUnseenEventCounts(adminEmail: string): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT e.link_id, COUNT(*) as cnt
    FROM link_events e
    LEFT JOIN link_views v ON v.admin_email = ? AND v.link_id = e.link_id
    WHERE v.last_viewed_at IS NULL OR e.created_at > v.last_viewed_at
    GROUP BY e.link_id
  `).all(adminEmail) as { link_id: string; cnt: number }[];
  const result: Record<string, number> = {};
  for (const r of rows) result[r.link_id] = r.cnt;
  return result;
}

// ---- Investor helpers ----

export interface InvestorRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  investor_type: string;
  share_class: string | null;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  drive_folder_url: string | null;
  source: string;
  created_at: string;
}

export function getAllInvestors(): InvestorRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM investors ORDER BY last_name ASC, first_name ASC').all() as InvestorRow[];
}

export function getInvestorById(id: string): InvestorRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM investors WHERE id = ?').get(id) as InvestorRow | undefined;
}

export function getInvestorByDriveFolderId(driveFolderId: string): InvestorRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM investors WHERE drive_folder_id = ?').get(driveFolderId) as InvestorRow | undefined;
}

export function upsertInvestorFromDrive(params: {
  driveFolderId: string;
  driveFolderName: string;
  driveFolderUrl: string;
  firstName: string;
  lastName: string;
}) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM investors WHERE drive_folder_id = ?').get(params.driveFolderId) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE investors SET drive_folder_name = ?, drive_folder_url = ? WHERE id = ?`)
      .run(params.driveFolderName, params.driveFolderUrl, existing.id);
  } else {
    db.prepare(`INSERT INTO investors (id, first_name, last_name, drive_folder_id, drive_folder_name, drive_folder_url, source) VALUES (?, ?, ?, ?, ?, ?, 'drive')`)
      .run(crypto.randomUUID(), params.firstName, params.lastName, params.driveFolderId, params.driveFolderName, params.driveFolderUrl);
  }
}

export function upsertInvestorFromPortal(params: {
  firstName: string;
  lastName: string;
  email?: string | null;
  investorType?: string;
  shareClass?: string | null;
  driveFolderId?: string | null;
}) {
  const db = getDb();
  if (params.driveFolderId) {
    const existing = db.prepare('SELECT id FROM investors WHERE drive_folder_id = ?').get(params.driveFolderId) as { id: string } | undefined;
    if (existing) {
      db.prepare(`UPDATE investors SET first_name = ?, last_name = ?, email = COALESCE(?, email), investor_type = COALESCE(?, investor_type), share_class = COALESCE(?, share_class), source = 'portal' WHERE id = ?`)
        .run(params.firstName, params.lastName, params.email || null, params.investorType || null, params.shareClass || null, existing.id);
      return;
    }
  }
  const byName = db.prepare('SELECT id FROM investors WHERE first_name = ? AND last_name = ?').get(params.firstName, params.lastName) as { id: string } | undefined;
  if (byName) {
    db.prepare(`UPDATE investors SET email = COALESCE(?, email), investor_type = COALESCE(?, investor_type), share_class = COALESCE(?, share_class), drive_folder_id = COALESCE(?, drive_folder_id), source = 'portal' WHERE id = ?`)
      .run(params.email || null, params.investorType || null, params.shareClass || null, params.driveFolderId || null, byName.id);
    return;
  }
  db.prepare(`INSERT INTO investors (id, first_name, last_name, email, investor_type, share_class, drive_folder_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'portal')`)
    .run(crypto.randomUUID(), params.firstName, params.lastName, params.email || null, params.investorType || 'individual', params.shareClass || null, params.driveFolderId || null);
}

export function updateInvestor(id: string, params: { firstName?: string; lastName?: string; email?: string | null; shareClass?: string | null }) {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (params.firstName !== undefined) { sets.push('first_name = ?'); values.push(params.firstName); }
  if (params.lastName !== undefined) { sets.push('last_name = ?'); values.push(params.lastName); }
  if (params.email !== undefined) { sets.push('email = ?'); values.push(params.email); }
  if (params.shareClass !== undefined) { sets.push('share_class = ?'); values.push(params.shareClass); }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE investors SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}
