import type { Tool } from '../registry.js'
import type { MemoryManager } from '../../memory/manager.js'

export class MemoryManagerTool implements Tool {
  readonly name = 'memory_manager'
  readonly description = 'Verwaltet das Langzeitgedaechtnis: Fakten speichern, abrufen, suchen und loeschen.'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['remember', 'recall', 'search', 'forget', 'list'],
        description: 'Die auszufuehrende Aktion',
      },
      category: {
        type: 'string',
        description: 'Kategorie: vorlieben, persoenlich, technik, ziele, projekte, gewohnheiten, wichtig',
      },
      key: { type: 'string', description: 'Eindeutiger Bezeichner des Eintrags' },
      value: { type: 'string', description: 'Zu speichernder Wert (nur bei action=remember)' },
      query: { type: 'string', description: 'Suchbegriff (nur bei action=search)' },
    },
    required: ['action'],
  }

  constructor(private readonly memory: MemoryManager) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '')
    const category = String(args.category ?? '')
    const key = String(args.key ?? '')
    const value = String(args.value ?? '')
    const query = String(args.query ?? '')

    switch (action) {
      case 'remember': {
        if (!category || !key || !value) return 'Fehler: category, key und value erforderlich.'
        this.memory.remember(category, key, value)
        return `Gespeichert: [${category}] ${key} = ${value}`
      }
      case 'recall': {
        if (!category || !key) return 'Fehler: category und key erforderlich.'
        const db = (this.memory as unknown as { db: { recall: (c: string, k: string) => string | null } }).db
        const val = db.recall(category, key)
        return val ? `[${category}] ${key}: ${val}` : `Kein Eintrag fuer '${key}' in Kategorie '${category}'.`
      }
      case 'search': {
        if (!query) return 'Fehler: query erforderlich.'
        const results = await this.memory.search(query, 10)
        if (!results.length) return `Keine Ergebnisse fuer '${query}'.`
        return results.map(r => `[${r.category}] ${r.key}: ${r.value}`).join('\n')
      }
      case 'forget': {
        if (!category || !key) return 'Fehler: category und key erforderlich.'
        this.memory.forget(category, key)
        return `Eintrag geloescht: [${category}] ${key}`
      }
      case 'list': {
        const memories = category
          ? (this.memory as unknown as { db: { recallCategory: (c: string) => Array<{ key: string; value: string }> } }).db.recallCategory(category)
            .map(m => `[${category}] ${m.key}: ${m.value}`)
          : this.memory.getRecentMemories(20).map(m => `[${m.category}] ${m.key}: ${m.value}`)
        return memories.length ? memories.join('\n') : 'Keine Eintraege gefunden.'
      }
      default:
        return `Unbekannte Aktion: ${action}`
    }
  }
}
