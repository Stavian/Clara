import type { LLMClient, LLMMessage, LLMToolDefinition } from '../llm/client.js'
import { stripThink } from '../llm/client.js'
import { createLLMClient } from '../llm/factory.js'
import type { ToolRegistry, ToolContext } from '../tools/registry.js'
import { resolveAgentScope, listAgentIds, getDefaultAgentId } from './agent-scope.js'
import type { ResolvedConfig } from '../config/config.js'
import type { AgentRouter as IAgentRouter, AgentEvent } from '../gateway/call.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('agent-router')
const IMG_RE = /!\[([^\]]*)\]\((\/generated\/[^)]+)\)/g

export class AgentRouter implements IAgentRouter {
  private readonly _clients: Map<string, LLMClient> = new Map()

  constructor(
    private readonly defaultLlm: LLMClient,
    private readonly tools: ToolRegistry,
    private readonly cfg: ResolvedConfig,
  ) {}

  private _getClient(agentId: string): LLMClient {
    if (!this._clients.has(agentId)) {
      const scope = resolveAgentScope(agentId, this.cfg)
      const client = createLLMClient(scope.model, this.cfg)
      this._clients.set(agentId, client)
    }
    return this._clients.get(agentId)!
  }

  getScope(agentId: string) {
    return resolveAgentScope(agentId, this.cfg)
  }

  getDelegate(_currentAgentId: string, allowedAgents?: string[]): LLMToolDefinition | null {
    const defaultId = getDefaultAgentId(this.cfg)
    const available = listAgentIds(this.cfg).filter(id => {
      if (id === defaultId) return false
      if (allowedAgents && !allowedAgents.includes(id)) return false
      return true
    })
    if (!available.length) return null

    const descriptions = available.map(id => {
      const scope = resolveAgentScope(id, this.cfg)
      return `- ${id}: ${scope.description}`
    }).join('\n')

    return {
      type: 'function',
      function: {
        name: 'delegate_to_agent',
        description:
          `Delegiere eine Aufgabe an einen spezialisierten Agenten. ` +
          `Nutze dies NUR wenn die Aufgabe klar von einem Spezialisten profitiert. ` +
          `Einfache Fragen beantwortest du selbst direkt.\n` +
          `Verfuegbare Agenten:\n${descriptions}`,
        parameters: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              enum: available,
              description: 'Welcher Spezialist die Aufgabe uebernehmen soll',
            },
            task: {
              type: 'string',
              description: 'Klare Beschreibung der Aufgabe mit allem relevanten Kontext aus der Nutzeranfrage',
            },
          },
          required: ['agent', 'task'],
        },
      },
    }
  }

  getAllowedAgents(allowedSkills: string[]): string[] {
    return listAgentIds(this.cfg).filter(id => {
      if (id === getDefaultAgentId(this.cfg)) return false
      const scope = resolveAgentScope(id, this.cfg)
      if (!scope.skills) return false
      return scope.skills.every(s => allowedSkills.includes(s))
    })
  }

  async runAgent(
    agentId: string,
    task: string,
    conversationContext: LLMMessage[],
  ): Promise<{ text: string; events: AgentEvent[] }> {
    const scope = resolveAgentScope(agentId, this.cfg)
    const llm = this._getClient(agentId)
    const events: AgentEvent[] = []

    logger.info(`Running agent '${agentId}' with model '${scope.model}'`)

    const messages: LLMMessage[] = []
    if (scope.systemPrompt) messages.push({ role: 'system', content: scope.systemPrompt })

    // Include limited conversation context
    const ctxLimit = scope.contextWindow
    for (const msg of conversationContext.slice(-ctxLimit)) {
      if (msg.role === 'user' || msg.role === 'assistant') messages.push(msg)
    }
    messages.push({ role: 'user', content: task })

    const toolFilter = scope.skills ?? undefined
    const toolDefs = this.tools.getDefinitions(toolFilter as string[] | undefined)

    const ctx: ToolContext = {
      sessionId: `agent:${agentId}`,
      agentId,
      channel: 'agent',
    }

    let response: import('../llm/client.js').LLMResponse = { content: '' }

    for (let round = 0; round < scope.maxRounds; round++) {
      response = await llm.chat(messages, toolDefs.length ? toolDefs : undefined)
      if (!response.tool_calls?.length) break

      for (const tc of response.tool_calls) {
        const toolName = tc.function.name
        const toolArgs = tc.function.arguments

        events.push({ type: 'tool_call', tool: `${agentId}:${toolName}`, args: toolArgs })

        const result = await this.tools.execute(toolName, toolArgs, ctx)

        // Extract images
        const imgMatches = [...result.matchAll(IMG_RE)]
        for (const [, alt, src] of imgMatches) {
          events.push({ type: 'image', src, alt })
        }

        const cleanResult = imgMatches.length
          ? result.replace(IMG_RE, '[Bild wurde angezeigt]')
          : result

        messages.push({ role: 'assistant', content: '', tool_calls: [tc] })
        messages.push({ role: 'tool', name: toolName, content: cleanResult })
      }
    }

    let text = stripThink(response.content ?? '')
    if (!text) {
      messages.push({ role: 'user', content: 'Fasse die Ergebnisse zusammen und beantworte die Aufgabe.' })
      const fallback = await llm.chat(messages)
      text = stripThink(fallback.content ?? '')
    }

    logger.info(`Agent '${agentId}' finished. Response: ${text.length} chars`)
    return { text: text || 'Der Agent konnte keine Antwort generieren.', events }
  }
}
