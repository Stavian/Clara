import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Tool } from '../registry.js'

const execFileAsync = promisify(execFile)

export class ClipboardTool implements Tool {
  readonly name = 'clipboard'
  readonly description = 'Liest und schreibt den Inhalt der Zwischenablage.'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write'],
        description: 'read = Inhalt lesen, write = Inhalt schreiben',
      },
      text: { type: 'string', description: 'Text zum Schreiben (nur bei action=write)' },
    },
    required: ['action'],
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '')

    try {
      if (process.platform === 'win32') {
        if (action === 'read') {
          const { stdout } = await execFileAsync('powershell', ['-Command', 'Get-Clipboard'], { timeout: 5_000 })
          return stdout.trim() || '(Zwischenablage ist leer)'
        } else {
          const text = String(args.text ?? '')
          await execFileAsync('powershell', ['-Command', `Set-Clipboard -Value '${text.replace(/'/g, "''")}'`], { timeout: 5_000 })
          return `Zwischenablage wurde gesetzt.`
        }
      } else {
        if (action === 'read') {
          try {
            const { stdout } = await execFileAsync('xclip', ['-selection', 'clipboard', '-o'], { timeout: 5_000 })
            return stdout.trim() || '(Zwischenablage ist leer)'
          } catch {
            const { stdout } = await execFileAsync('xsel', ['--clipboard', '--output'], { timeout: 5_000 })
            return stdout.trim() || '(Zwischenablage ist leer)'
          }
        } else {
          const text = String(args.text ?? '')
          try {
            const child = execFile('xclip', ['-selection', 'clipboard'], { timeout: 5_000 })
            child.stdin?.write(text)
            child.stdin?.end()
            await new Promise<void>((res, rej) => child.on('close', c => c === 0 ? res() : rej(new Error(`Exit ${c}`))))
          } catch {
            const child = execFile('xsel', ['--clipboard', '--input'], { timeout: 5_000 })
            child.stdin?.write(text)
            child.stdin?.end()
            await new Promise<void>((res, rej) => child.on('close', c => c === 0 ? res() : rej(new Error(`Exit ${c}`))))
          }
          return 'Zwischenablage wurde gesetzt.'
        }
      }
    } catch (err) {
      return `Fehler: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
