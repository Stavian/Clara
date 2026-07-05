import BetterSqlite3 from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from './logger.js'

const logger = createLogger('db')

export class Database {
  readonly raw: BetterSqlite3.Database

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true })
    this.raw = new BetterSqlite3(dbPath)
    this.raw.pragma('journal_mode = WAL')
    this.raw.pragma('synchronous = NORMAL')
    this._init()
    logger.info(`Database initialized at ${dbPath}`)
  }

  private _init() {
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(category, key)
      );
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        due_date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        cron_expr TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        skill_args TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        secret TEXT,
        event_type TEXT NOT NULL DEFAULT 'webhook',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS automation_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        trigger_event TEXT NOT NULL,
        actions TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, id);
      CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
      CREATE INDEX IF NOT EXISTS idx_memory_category_key ON memory(category, key);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `)
  }

  // --- Conversations ---
  saveMessage(sessionId: string, role: string, content: string) {
    this.raw.prepare(
      'INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
    ).run(sessionId, role, content, new Date().toISOString())
  }

  getHistory(sessionId: string, limit = 20): Array<{ role: string; content: string }> {
    return this.raw.prepare(
      'SELECT role, content FROM (SELECT role, content, id FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT ?) sub ORDER BY id ASC'
    ).all(sessionId, limit) as Array<{ role: string; content: string }>
  }

  clearHistory(sessionId: string) {
    this.raw.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId)
  }

  countConversations(): number {
    const row = this.raw.prepare('SELECT COUNT(DISTINCT session_id) as cnt FROM conversations').get() as { cnt: number }
    return row?.cnt ?? 0
  }

  // --- Memory ---
  remember(category: string, key: string, value: string) {
    this.raw.prepare(
      `INSERT INTO memory (category, key, value, timestamp) VALUES (?, ?, ?, ?)
       ON CONFLICT(category, key) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp`
    ).run(category, key, value, new Date().toISOString())
  }

  recall(category: string, key: string): string | null {
    const row = this.raw.prepare('SELECT value FROM memory WHERE category = ? AND key = ?').get(category, key) as { value: string } | undefined
    return row?.value ?? null
  }

  recallCategory(category: string): Array<{ key: string; value: string }> {
    return this.raw.prepare(
      'SELECT key, value FROM memory WHERE category = ? ORDER BY timestamp DESC'
    ).all(category) as Array<{ key: string; value: string }>
  }

  forget(category: string, key: string) {
    this.raw.prepare('DELETE FROM memory WHERE category = ? AND key = ?').run(category, key)
  }

  searchMemory(query: string, limit = 20): Array<{ category: string; key: string; value: string; timestamp: string }> {
    return this.raw.prepare(
      'SELECT category, key, value, timestamp FROM memory WHERE key LIKE ? OR value LIKE ? ORDER BY timestamp DESC LIMIT ?'
    ).all(`%${query}%`, `%${query}%`, limit) as Array<{ category: string; key: string; value: string; timestamp: string }>
  }

  getRecentMemories(limit = 30): Array<{ category: string; key: string; value: string; timestamp: string }> {
    return this.raw.prepare(
      'SELECT category, key, value, timestamp FROM memory ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as Array<{ category: string; key: string; value: string; timestamp: string }>
  }

  getAllCategories(): string[] {
    return (this.raw.prepare('SELECT DISTINCT category FROM memory ORDER BY category').all() as Array<{ category: string }>).map(r => r.category)
  }

  countMemories(): number {
    const row = this.raw.prepare('SELECT COUNT(*) as cnt FROM memory').get() as { cnt: number }
    return row?.cnt ?? 0
  }

  memoryByCategory(): Array<{ category: string; count: number }> {
    return this.raw.prepare(
      'SELECT category, COUNT(*) as count FROM memory GROUP BY category ORDER BY count DESC'
    ).all() as Array<{ category: string; count: number }>
  }

  // --- Projects ---
  createProject(name: string, description = ''): Record<string, unknown> {
    const result = this.raw.prepare('INSERT INTO projects (name, description) VALUES (?, ?)').run(name, description)
    return this.raw.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
  }

  getProjectById(id: number): Record<string, unknown> | null {
    return this.raw.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | null
  }

  getProjectByName(name: string): Record<string, unknown> | null {
    return this.raw.prepare('SELECT * FROM projects WHERE name = ?').get(name) as Record<string, unknown> | null
  }

  listProjectsWithTaskCounts(): Record<string, unknown>[] {
    return this.raw.prepare(`
      SELECT p.*, COUNT(t.id) as task_count,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC
    `).all() as Record<string, unknown>[]
  }

  updateProject(id: number, fields: Record<string, unknown>) {
    if (Object.keys(fields).length === 0) return
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
    this.raw.prepare(`UPDATE projects SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
      .run(...Object.values(fields), id)
  }

  deleteProject(id: number) {
    this.raw.prepare('DELETE FROM tasks WHERE project_id = ?').run(id)
    this.raw.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  projectStats(): { total: number } & Record<string, number> {
    const rows = this.raw.prepare('SELECT status, COUNT(*) as cnt FROM projects GROUP BY status').all() as Array<{ status: string; cnt: number }>
    const stats: { total: number } & Record<string, number> = { total: 0 }
    for (const r of rows) { stats[r.status] = r.cnt; stats.total += r.cnt }
    return stats
  }

  // --- Tasks ---
  addTask(projectId: number, title: string, description = '', priority = 0): Record<string, unknown> {
    const result = this.raw.prepare(
      'INSERT INTO tasks (project_id, title, description, priority) VALUES (?, ?, ?, ?)'
    ).run(projectId, title, description, priority)
    return this.raw.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
  }

  getTask(id: number): Record<string, unknown> | null {
    return this.raw.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | null
  }

  listTasksByProject(projectId: number): Record<string, unknown>[] {
    return this.raw.prepare(
      'SELECT * FROM tasks WHERE project_id = ? ORDER BY priority DESC, created_at ASC'
    ).all(projectId) as Record<string, unknown>[]
  }

  updateTask(id: number, fields: Record<string, unknown>) {
    if (Object.keys(fields).length === 0) return
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
    this.raw.prepare(`UPDATE tasks SET ${sets} WHERE id = ?`).run(...Object.values(fields), id)
  }

  deleteTask(id: number) {
    this.raw.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  taskStats(): { total: number } & Record<string, number> {
    const rows = this.raw.prepare('SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status').all() as Array<{ status: string; cnt: number }>
    const stats: { total: number } & Record<string, number> = { total: 0 }
    for (const r of rows) { stats[r.status] = r.cnt; stats.total += r.cnt }
    return stats
  }

  // --- Scheduled Jobs ---
  listJobs(): Record<string, unknown>[] {
    return this.raw.prepare('SELECT * FROM scheduled_jobs ORDER BY name').all() as Record<string, unknown>[]
  }

  upsertJob(name: string, cronExpr: string, skillName: string, skillArgs: Record<string, unknown>) {
    this.raw.prepare(`
      INSERT INTO scheduled_jobs (name, cron_expr, skill_name, skill_args) VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET cron_expr = excluded.cron_expr, skill_name = excluded.skill_name, skill_args = excluded.skill_args
    `).run(name, cronExpr, skillName, JSON.stringify(skillArgs))
  }

  deleteJob(name: string) {
    this.raw.prepare('DELETE FROM scheduled_jobs WHERE name = ?').run(name)
  }

  updateJobLastRun(name: string) {
    this.raw.prepare(`UPDATE scheduled_jobs SET last_run = datetime('now') WHERE name = ?`).run(name)
  }

  // --- Webhooks ---
  listWebhooks(): Record<string, unknown>[] {
    return this.raw.prepare('SELECT * FROM webhooks ORDER BY name').all() as Record<string, unknown>[]
  }

  getWebhook(name: string): Record<string, unknown> | null {
    return this.raw.prepare('SELECT * FROM webhooks WHERE name = ?').get(name) as Record<string, unknown> | null
  }

  upsertWebhook(name: string, secret: string | null, eventType: string) {
    this.raw.prepare(`
      INSERT INTO webhooks (name, secret, event_type) VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET secret = excluded.secret, event_type = excluded.event_type
    `).run(name, secret, eventType)
  }

  deleteWebhook(name: string) {
    this.raw.prepare('DELETE FROM webhooks WHERE name = ?').run(name)
  }

  // --- Automation Rules ---
  listAutomationRules(): Record<string, unknown>[] {
    return this.raw.prepare('SELECT * FROM automation_rules ORDER BY name').all() as Record<string, unknown>[]
  }

  upsertAutomationRule(name: string, triggerEvent: string, actions: unknown[]) {
    this.raw.prepare(`
      INSERT INTO automation_rules (name, trigger_event, actions) VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET trigger_event = excluded.trigger_event, actions = excluded.actions
    `).run(name, triggerEvent, JSON.stringify(actions))
  }

  deleteAutomationRule(name: string) {
    this.raw.prepare('DELETE FROM automation_rules WHERE name = ?').run(name)
  }

  close() {
    this.raw.close()
    logger.info('Database connection closed')
  }
}
