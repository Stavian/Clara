import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Tool } from '../registry.js'

const execFileAsync = promisify(execFile)

export class SystemCommandTool implements Tool {
  readonly name = 'system_command'
  readonly description = 'Fuehrt Systembefehle und Shell-Skripte aus.'
  readonly parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Der auszufuehrende Befehl' },
      timeout: { type: 'integer', description: 'Timeout in Sekunden (Standard: 30)' },
      working_dir: { type: 'string', description: 'Arbeitsverzeichnis (optional)' },
    },
    required: ['command'],
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const command = String(args.command ?? '')
    const timeout = Number(args.timeout ?? 30) * 1000
    const cwd = args.working_dir ? String(args.working_dir) : undefined

    if (!command.trim()) return 'Fehler: Kein Befehl angegeben.'

    try {
      const isWindows = process.platform === 'win32'
      const shell = isWindows ? 'cmd.exe' : '/bin/bash'
      const shellArg = isWindows ? '/c' : '-c'

      const { stdout, stderr } = await execFileAsync(shell, [shellArg, command], {
        timeout,
        cwd,
        maxBuffer: 1024 * 1024 * 5, // 5 MB
        encoding: 'utf-8',
      })

      const out = [stdout, stderr].filter(Boolean).join('\n').trim()
      return out || 'Befehl ausgefuehrt (keine Ausgabe).'
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'stdout' in err) {
        const e = err as { stdout?: string; stderr?: string; message?: string }
        const out = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
        return out || `Fehler: ${e.message}`
      }
      return `Fehler: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
