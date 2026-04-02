/**
 * Seed script: Create an initial admin user.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts <username> <password>
 *
 * Example:
 *   npx tsx scripts/seed-admin.ts admin capella2026
 */

import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = process.env.DATABASE_PATH || './data/kyc.db';
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: npx tsx scripts/seed-admin.ts <username> <password>');
  process.exit(1);
}

const [username, password] = args;

// Ensure data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

// Check if user exists
const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
if (existing) {
  console.log(`Admin user "${username}" already exists.`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);
const id = crypto.randomUUID();

db.prepare('INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)').run(id, username, passwordHash);
console.log(`Admin user "${username}" created successfully.`);

db.close();
