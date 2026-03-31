const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "leadsprout.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

// Create table with level + score columns
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    title TEXT,
    company TEXT,
    domain TEXT,
    linkedin_url TEXT,
    linkedin_confidence TEXT,
    email TEXT,
    email_confidence TEXT,
    phone TEXT,
    phone_confidence TEXT,
    level TEXT,
    score INTEGER,
    source TEXT,
    job_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add level/score columns if they don't exist (migration for existing DBs)
try { db.exec("ALTER TABLE leads ADD COLUMN level TEXT"); } catch {}
try { db.exec("ALTER TABLE leads ADD COLUMN score INTEGER"); } catch {}

function initDb() {
  console.log("Database initialized — leads table ready (SQLite)");
}

const insertStmt = db.prepare(`
  INSERT INTO leads (name, title, company, domain, linkedin_url, linkedin_confidence, email, email_confidence, phone, phone_confidence, level, score, source, job_id)
  VALUES (@name, @title, @company, @domain, @linkedin_url, @linkedin_confidence, @email, @email_confidence, @phone, @phone_confidence, @level, @score, @source, @job_id)
`);

function insertLead(lead) {
  const info = insertStmt.run({
    name: lead.name || null,
    title: lead.title || null,
    company: lead.company || null,
    domain: lead.domain || null,
    linkedin_url: lead.linkedin_url || null,
    linkedin_confidence: lead.linkedin_confidence || null,
    email: lead.email || null,
    email_confidence: lead.email_confidence || null,
    phone: lead.phone || null,
    phone_confidence: lead.phone_confidence || null,
    level: lead.level || null,
    score: lead.score || null,
    source: lead.source || null,
    job_id: lead.job_id || null,
  });
  return { ...lead, id: info.lastInsertRowid };
}

function getLeadsByJobId(jobId) {
  return db.prepare("SELECT * FROM leads WHERE job_id = ? ORDER BY score DESC, created_at DESC").all(jobId);
}

function getAllLeads() {
  return db.prepare("SELECT * FROM leads ORDER BY score DESC, created_at DESC LIMIT 200").all();
}

module.exports = { db, initDb, insertLead, getLeadsByJobId, getAllLeads };
