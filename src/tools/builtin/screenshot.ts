import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Tool } from '../registry.js'

const execFileAsync = promisify(execFile)

export class ScreenshotTool implements Tool {
  readonly name = 'screenshot'
  readonly description = 'Nimmt einen Screenshot des Bildschirms auf.'
  readonly parameters = {
    type: 'object',
    properties: {
      monitor: { type: 'integer', description: 'Monitor-Nummer (Standard: 0 = Hauptmonitor)' },
    },
    required: [],
  }

  constructor(private readonly outputDir: string) {
    mkdirSync(outputDir, { recursive: true })
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const filename = `screenshot_${Date.now()}.png`
    const filepath = path.join(this.outputDir, filename)
    const monitor = Number(args.monitor ?? 0)

    try {
      if (process.platform === 'win32') {
        const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens[${monitor}] | ForEach-Object { $bounds = $_.Bounds; $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bmp.Save("${filepath.replace(/\\/g, '\\\\')}") }`
        await execFileAsync('powershell', ['-Command', ps], { timeout: 15_000 })
      } else {
        await execFileAsync('scrot', [filepath], { timeout: 15_000 })
      }
      return `![Screenshot](/generated/${filename})`
    } catch (err) {
      return `Fehler beim Screenshot: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
