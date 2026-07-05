import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Tool } from '../registry.js'

function expandPath(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1))
  return p
}

export class FileManagerTool implements Tool {
  readonly name = 'file_manager'
  readonly description = 'Verwaltet Dateien: Lesen, Schreiben, Auflisten, Erstellen und Loeschen von Dateien und Ordnern.'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'list', 'mkdir', 'delete', 'info'],
        description: 'Die auszufuehrende Aktion',
      },
      path: { type: 'string', description: 'Der Dateipfad' },
      content: { type: 'string', description: 'Inhalt zum Schreiben (nur bei action=write)' },
    },
    required: ['action', 'path'],
  }

  constructor(private readonly allowedDirectories: string[] | null = null) {}

  private _checkAccess(filePath: string): boolean {
    if (this.allowedDirectories === null) return true
    const resolved = path.resolve(filePath)
    return this.allowedDirectories.some(d => resolved.startsWith(path.resolve(d)))
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '')
    const filePath = expandPath(String(args.path ?? ''))
    const content = String(args.content ?? '')

    if (!this._checkAccess(filePath)) {
      return `Zugriff verweigert: '${filePath}' liegt nicht in den erlaubten Verzeichnissen.`
    }

    try {
      switch (action) {
        case 'read': {
          if (!existsSync(filePath)) return `Datei nicht gefunden: ${filePath}`
          let text = readFileSync(filePath, 'utf-8')
          if (text.length > 10000) text = text.slice(0, 10000) + '\n... (gekuerzt)'
          return text
        }
        case 'write': {
          mkdirSync(path.dirname(filePath), { recursive: true })
          writeFileSync(filePath, content, 'utf-8')
          return `Datei geschrieben: ${filePath}`
        }
        case 'list': {
          if (!existsSync(filePath)) return `Verzeichnis nicht gefunden: ${filePath}`
          const entries = readdirSync(filePath, { withFileTypes: true })
          const sorted = entries.sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          const lines = sorted.slice(0, 100).map(e => {
            const prefix = e.isDirectory() ? '[DIR]  ' : '[FILE] '
            let size = ''
            if (e.isFile()) {
              try {
                const s = statSync(path.join(filePath, e.name)).size
                size = s < 1024 ? ` (${s} B)` : s < 1048576 ? ` (${(s / 1024).toFixed(1)} KB)` : ` (${(s / 1048576).toFixed(1)} MB)`
              } catch { /* skip */ }
            }
            return `${prefix}${e.name}${size}`
          })
          if (sorted.length > 100) lines.push(`... und ${sorted.length - 100} weitere Eintraege`)
          return lines.join('\n') || '(leer)'
        }
        case 'mkdir': {
          mkdirSync(filePath, { recursive: true })
          return `Verzeichnis erstellt: ${filePath}`
        }
        case 'delete': {
          if (!existsSync(filePath)) return `Nicht gefunden: ${filePath}`
          rmSync(filePath, { recursive: true, force: true })
          return `Geloescht: ${filePath}`
        }
        case 'info': {
          if (!existsSync(filePath)) return `Nicht gefunden: ${filePath}`
          const stat = statSync(filePath)
          return [
            `Pfad: ${filePath}`,
            `Typ: ${stat.isDirectory() ? 'Verzeichnis' : 'Datei'}`,
            `Groesse: ${stat.size} Bytes`,
            `Erstellt: ${stat.birthtime.toISOString()}`,
            `Geaendert: ${stat.mtime.toISOString()}`,
          ].join('\n')
        }
        default:
          return `Unbekannte Aktion: ${action}`
      }
    } catch (err) {
      return `Fehler: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
