import { createRequire } from 'node:module'
import type { Database } from '../infra/db.js'
import type { EmbeddingClient } from './embeddings.js'
import { createLogger } from '../infra/logger.js'

const _require = createRequire(import.meta.url)

const logger = createLogger('memory')

export interface MemorySearchResult {
  category: string
  key: string
  value: string
  timestamp: string
  score?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  vorlieben: 'Vorlieben',
  persoenlich: 'Persoenliches',
  technik: 'Technik',
  ziele: 'Ziele',
  projekte: 'Projekte',
  gewohnheiten: 'Gewohnheiten',
  wichtig: 'Wichtig',
}

export class MemoryManager {
  private readonly db: Database
  private readonly embeddings: EmbeddingClient | null
  private _vecReady = false

  constructor(db: Database, embeddings?: EmbeddingClient) {
    this.db = db
    this.embeddings = embeddings ?? null
    this._initVec()
  }

  private _initVec() {
    try {
      // sqlite-vec extension for vector similarity search
      const sqliteVec = _require('sqlite-vec') as { load: (db: unknown) => void }
      sqliteVec.load(this.db.raw)

      const dims = this.embeddings?.dimensions ?? 768
      this.db.raw.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
          embedding FLOAT[${dims}]
        );
      `)

      // Add FTS5 for keyword search
      this.db.raw.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          category, key, value,
          content=memory,
          content_rowid=id,
          tokenize='porter unicode61'
        );
      `)

      this._vecReady = true
      logger.info('sqlite-vec vector extension loaded')
    } catch (err) {
      logger.warn('sqlite-vec not available, using keyword search only', err)
    }
  }

  remember(category: string, key: string, value: string) {
    this.db.remember(category, key, value)

    if (this._vecReady && this.embeddings) {
      // Embed asynchronously, don't block
      this._embedAndStore(category, key, value).catch(err =>
        logger.warn(`Background embedding failed for ${key}`, err)
      )
    }
  }

  private async _embedAndStore(category: string, key: string, value: string) {
    if (!this.embeddings) return
    const text = `[${category}] ${key}: ${value}`
    const vector = await this.embeddings.embed(text)
    if (!vector.length) return

    // Get memory row id
    const row = this.db.raw.prepare('SELECT id FROM memory WHERE category = ? AND key = ?').get(category, key) as { id: number } | undefined
    if (!row) return

    const vecData = new Float32Array(vector)
    this.db.raw.prepare('INSERT OR REPLACE INTO memory_vec(rowid, embedding) VALUES (?, ?)').run(row.id, vecData)
  }

  forget(category: string, key: string) {
    // Remove from vec index too
    const row = this.db.raw.prepare('SELECT id FROM memory WHERE category = ? AND key = ?').get(category, key) as { id: number } | undefined
    if (row && this._vecReady) {
      this.db.raw.prepare('DELETE FROM memory_vec WHERE rowid = ?').run(row.id)
    }
    this.db.forget(category, key)
  }

  async search(query: string, limit = 20): Promise<MemorySearchResult[]> {
    if (this._vecReady && this.embeddings) {
      try {
        return await this._hybridSearch(query, limit)
      } catch (err) {
        logger.warn('Vector search failed, falling back to keyword', err)
      }
    }
    return this.db.searchMemory(query, limit)
  }

  private async _hybridSearch(query: string, limit: number): Promise<MemorySearchResult[]> {
    const queryVec = await this.embeddings!.embed(query)
    if (!queryVec.length) return this.db.searchMemory(query, limit)

    const vecData = new Float32Array(queryVec)

    // Vector similarity search
    const vecResults = this.db.raw.prepare(`
      SELECT m.category, m.key, m.value, m.timestamp, v.distance as score
      FROM memory_vec v
      JOIN memory m ON m.id = v.rowid
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
      LIMIT ?
    `).all(vecData, limit * 2, limit) as MemorySearchResult[]

    // Keyword search
    const kwResults = this.db.searchMemory(query, limit) as MemorySearchResult[]

    // Merge results by deduplication (prefer vec results)
    const seen = new Set<string>()
    const merged: MemorySearchResult[] = []
    for (const r of [...vecResults, ...kwResults]) {
      const k = `${r.category}:${r.key}`
      if (!seen.has(k)) {
        seen.add(k)
        merged.push(r)
      }
    }
    return merged.slice(0, limit)
  }

  getRecentMemories(limit = 30) {
    return this.db.getRecentMemories(limit)
  }

  buildMemoryContext(limit = 30): string {
    const memories = this.db.getRecentMemories(limit)
    if (!memories.length) return ''

    const grouped: Record<string, typeof memories> = {}
    for (const m of memories) {
      if (!grouped[m.category]) grouped[m.category] = []
      grouped[m.category].push(m)
    }

    const lines = ['', 'Dein Gedaechtnis (was du ueber Marlon weisst):']
    for (const [cat, entries] of Object.entries(grouped)) {
      const label = CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1)
      for (const e of entries) {
        lines.push(`- [${label}] ${e.key}: ${e.value}`)
      }
    }
    lines.push('')
    lines.push('Nutze dieses Wissen aktiv in Gespraechen. Speichere neue Fakten mit dem memory_manager Tool.')

    return lines.join('\n')
  }
}

const EXTRACTION_PROMPT = `Analysiere den folgenden Gespraechsausschnitt zwischen einem Nutzer und einer KI-Assistentin.
Extrahiere ALLE neuen Fakten ueber den Nutzer (Name: Marlon).

Gib NUR ein JSON-Array zurueck. Jedes Element hat: category, key, value
Kategorien: vorlieben, persoenlich, technik, ziele, projekte, gewohnheiten, wichtig

Regeln:
- Nur EXPLIZIT genannte Fakten, NICHTS erfinden
- Kurze, praegnante Werte (max 100 Zeichen)
- Keys als kurze Bezeichner (z.B. "lieblingssprache", "beruf", "haustier")
- Wenn KEINE Fakten gefunden werden: leeres Array []
- KEIN erklaerende Text, NUR das JSON-Array

Gespraech:
{conversation}

JSON-Array:`

export async function extractFacts(
  llm: { generate: (prompt: string) => Promise<string> },
  memory: MemoryManager,
  userMessage: string,
  assistantMessage: string,
) {
  try {
    if (userMessage.length < 10) return

    const conversation = `Nutzer: ${userMessage}\nAssistentin: ${assistantMessage}`
    const prompt = EXTRACTION_PROMPT.replace('{conversation}', conversation)

    let raw = await llm.generate(prompt)

    // Strip think blocks
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '')
    const match = raw.match(/\[[\s\S]*?\]/)
    if (!match) return

    const facts = JSON.parse(match[0]) as Array<{ category?: string; key?: string; value?: string }>
    if (!Array.isArray(facts)) return

    let stored = 0
    for (const fact of facts) {
      const cat = (fact.category ?? '').trim()
      const key = (fact.key ?? '').trim()
      const val = (fact.value ?? '').trim()
      if (cat && key && val && val.length <= 200) {
        memory.remember(cat, key, val)
        stored++
      }
    }
    if (stored) logger.info(`Fact extractor: stored ${stored} facts`)
  } catch {
    // Fire-and-forget, errors are silent
  }
}
