import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Tool, ToolContext } from '../registry.js'

export class BatchScriptTool implements Tool {
  readonly name = 'batch_script'
  readonly description = 'Fuehrt mehrstufige Skripte aus, die mehrere Skills nacheinander aufrufen.'
  readonly parameters = {
    type: 'object',
    properties: {
      script_name: { type: 'string', description: 'Name des Skripts (ohne .json)' },
      args: { type: 'object', description: 'Variablen fuer das Skript' },
    },
    required: ['script_name'],
  }

  constructor(
    private readonly scriptsDir: string,
    private readonly executeSkill: (name: string, args: Record<string, unknown>, ctx: ToolContext) => Promise<string>,
  ) {
    mkdirSync(scriptsDir, { recursive: true })
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const scriptName = String(args.script_name ?? '').trim()
    const scriptArgs = (args.args ?? {}) as Record<string, unknown>

    const scriptPath = path.join(this.scriptsDir, `${scriptName}.json`)
    if (!existsSync(scriptPath)) {
      return `Skript '${scriptName}' nicht gefunden. Verfuegbar: ${this._listScripts().join(', ') || 'keine'}`
    }

    try {
      const script = JSON.parse(readFileSync(scriptPath, 'utf-8')) as {
        name?: string
        steps?: Array<{ skill: string; args: Record<string, unknown> }>
      }
      const steps = script.steps ?? []
      if (!steps.length) return `Skript '${scriptName}' hat keine Schritte.`

      const results: string[] = [`Skript '${scriptName}' ausfuehren (${steps.length} Schritte):`]
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        // Interpolate ${varName} from scriptArgs
        const interpolated = this._interpolate(step.args, scriptArgs)
        const result = await this.executeSkill(step.skill, interpolated, ctx)
        results.push(`Schritt ${i + 1} (${step.skill}): ${result.slice(0, 200)}`)
      }
      return results.join('\n')
    } catch (err) {
      return `Fehler beim Ausfuehren von '${scriptName}': ${err instanceof Error ? err.message : String(err)}`
    }
  }

  private _listScripts(): string[] {
    try {
      return existsSync(this.scriptsDir)
        ? readFileSync(this.scriptsDir + '/.scripts', 'utf-8').split('\n').filter(Boolean)
        : []
    } catch {
      return []
    }
  }

  private _interpolate(obj: unknown, vars: Record<string, unknown>): Record<string, unknown> {
    const str = JSON.stringify(obj)
    const replaced = str.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k] ?? `\${${k}}`))
    try { return JSON.parse(replaced) as Record<string, unknown> }
    catch { return {} }
  }
}
