import { createLogger } from '../infra/logger.js'

const logger = createLogger('tools')

export interface ToolContext {
  sessionId: string
  agentId: string
  channel: string
  userId?: string
}

export interface Tool {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export class ToolRegistry {
  private readonly _tools: Map<string, Tool> = new Map()

  register(tool: Tool) {
    this._tools.set(tool.name, tool)
    logger.info(`Tool registered: ${tool.name}`)
  }

  get(name: string): Tool | undefined {
    return this._tools.get(name)
  }

  getAll(): Tool[] {
    return [...this._tools.values()]
  }

  getDefinitions(filter?: string[]): ToolDefinition[] {
    const all = this.getAll()
    const filtered = filter ? all.filter(t => filter.includes(t.name)) : all
    return filtered.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }

  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const tool = this._tools.get(name)
    if (!tool) return `Fehler: Tool '${name}' nicht gefunden.`
    try {
      // Filter args to only valid parameters
      const validParams = new Set(Object.keys((tool.parameters as { properties?: Record<string, unknown> }).properties ?? {}))
      const filtered = validParams.size > 0
        ? Object.fromEntries(Object.entries(args).filter(([k]) => validParams.has(k)))
        : args
      return await tool.execute(filtered, ctx)
    } catch (err) {
      logger.error(`Tool '${name}' failed`, err)
      return `Fehler bei '${name}': ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
