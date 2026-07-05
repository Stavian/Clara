import type { ChannelAdapter } from '../channels/types.js'
import type { LLMClient, LLMMessage, LLMToolDefinition, LLMResponse } from '../llm/client.js'
import { stripThink } from '../llm/client.js'
import type { ToolRegistry, ToolContext } from '../tools/registry.js'
import type { MemoryManager } from '../memory/manager.js'
import { extractFacts } from '../memory/manager.js'
import type { Database } from '../infra/db.js'
import type { AgentScope } from '../agents/agent-scope.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('call')

const IMG_RE = /!\[([^\]]*)\]\((\/generated\/[^)]+)\)/g

export interface AgentRouter {
  getScope(agentId: string): AgentScope
  getDelegate(agentId: string, allowedAgents?: string[]): LLMToolDefinition | null
  getAllowedAgents(allowedSkills: string[]): string[]
  runAgent(
    agentId: string,
    task: string,
    conversationContext: LLMMessage[],
  ): Promise<{ text: string; events: AgentEvent[] }>
}

export interface AgentEvent {
  type: 'tool_call' | 'image'
  tool?: string
  args?: Record<string, unknown>
  src?: string
  alt?: string
}

export async function handleAgentCall(opts: {
  channel: ChannelAdapter
  llm: LLMClient
  db: Database
  tools: ToolRegistry
  memory: MemoryManager
  agentScope: AgentScope
  router: AgentRouter | null
  sessionId: string
  userMessage: string
  imageBase64?: string
  ttsEnabled?: boolean
  allowedSkills: string[] | null
  agentOverride?: string
  maxConversationHistory: number
}) {
  const {
    channel, llm, db, tools, memory, agentScope, router,
    sessionId, userMessage, imageBase64, ttsEnabled, allowedSkills, agentOverride, maxConversationHistory,
  } = opts

  let displayText = userMessage
  let userContent = userMessage

  if (imageBase64) {
    if (!userMessage) userContent = 'Was siehst du auf diesem Bild?'
    displayText = userMessage ? `[Bild angehaengt] ${userContent}` : '[Bild angehaengt]'
  }

  db.saveMessage(sessionId, 'user', displayText)

  const history = db.getHistory(sessionId, maxConversationHistory)
  const memoryContext = memory.buildMemoryContext()
  const systemContent = agentScope.systemPrompt + memoryContext

  let messages: LLMMessage[] = [{ role: 'system', content: systemContent }]
  messages = messages.concat(history as LLMMessage[])

  if (imageBase64) {
    // Replace last user message with image-attached version
    const lastUser = messages[messages.length - 1]
    if (lastUser?.role === 'user') {
      messages[messages.length - 1] = { ...lastUser, content: userContent, images: [imageBase64] }
    }
  }

  const ctx: ToolContext = {
    sessionId,
    agentId: agentScope.id,
    channel: 'webchat',
  }

  // Direct agent override mode (bypass main LLM + tool loop)
  if (agentOverride && agentOverride !== 'general' && router) {
    await channel.sendToolCall(`agent:${agentOverride}`, { task: userContent })
    const { text, events } = await router.runAgent(agentOverride, userContent, history as LLMMessage[])
    for (const ev of events) {
      if (ev.type === 'tool_call') await channel.sendToolCall(ev.tool ?? '', ev.args ?? {})
      else if (ev.type === 'image') await channel.sendImage(ev.src ?? '', ev.alt ?? '')
    }
    await channel.sendMessage(text)
    db.saveMessage(sessionId, 'assistant', text)
    _fireAndForget(() => extractFacts(llm, memory, displayText, text))
    if (ttsEnabled) _fireAndForget(() => _sendTTS(channel, text, agentScope))
    return text
  }

  // Build tools list
  const toolDefs = _buildToolDefs(tools, router, agentScope, allowedSkills)

  const maxRounds = agentScope.maxRounds
  let response: LLMResponse = { content: '' }

  for (let round = 0; round < maxRounds; round++) {
    response = await llm.chat(messages, toolDefs.length ? toolDefs : undefined)

    if (!response.tool_calls?.length) break

    const agentCalls = response.tool_calls.filter(tc => tc.function.name === 'delegate_to_agent' && router)
    const regularCalls = response.tool_calls.filter(tc => tc.function.name !== 'delegate_to_agent')

    // Handle agent delegations sequentially
    for (const tc of agentCalls) {
      const agentName = String(tc.function.arguments.agent ?? '')
      const task = String(tc.function.arguments.task ?? '')

      if (allowedSkills !== null) {
        const allowed = router!.getAllowedAgents(allowedSkills)
        if (!allowed.includes(agentName)) {
          messages.push({ role: 'assistant', content: '', tool_calls: [tc] })
          messages.push({ role: 'tool', name: 'delegate_to_agent', content: `Fehler: Zugriff auf Agent '${agentName}' nicht erlaubt.` })
          continue
        }
      }

      logger.info(`Delegating to agent: ${agentName}`)
      await channel.sendToolCall(`agent:${agentName}`, { task })
      const { text, events } = await router!.runAgent(agentName, task, history as LLMMessage[])
      for (const ev of events) {
        if (ev.type === 'tool_call') await channel.sendToolCall(ev.tool ?? '', ev.args ?? {})
        else if (ev.type === 'image') await channel.sendImage(ev.src ?? '', ev.alt ?? '')
      }
      messages.push({ role: 'assistant', content: '', tool_calls: [tc] })
      messages.push({ role: 'tool', name: 'delegate_to_agent', content: `[Antwort von Agent '${agentName}']\n${text}` })
    }

    // Handle regular tool calls in parallel
    if (regularCalls.length) {
      const results = await Promise.allSettled(
        regularCalls.map(tc => _executeTool(tc.function.name, tc.function.arguments, channel, tools, allowedSkills, ctx))
      )
      for (let i = 0; i < regularCalls.length; i++) {
        const tc = regularCalls[i]
        const res = results[i]
        const resultText = res.status === 'fulfilled' ? res.value : `Fehler: ${res.reason}`
        messages.push({ role: 'assistant', content: '', tool_calls: [tc] })
        messages.push({ role: 'tool', name: tc.function.name, content: `[Ergebnis von ${tc.function.name}]\n${resultText}` })
      }
    }

    if (!agentCalls.length && !regularCalls.length) break
  }

  let assistantText = stripThink(response.content ?? '')

  if (!assistantText && messages.length > 2) {
    // Ask the LLM to summarize tool results
    messages.push({
      role: 'user',
      content: 'Fasse die Ergebnisse der Tool-Aufrufe zusammen und beantworte meine urspruengliche Frage basierend auf den erhaltenen Daten.',
    })

    let rawText = ''
    let streamingStarted = false

    for await (const token of llm.stream(messages)) {
      rawText += token
      // Stop at leaked ChatML end-of-turn token (e.g. NemoMix/KoboldCpp)
      if (rawText.includes('<|im_end|>')) break
      if (!streamingStarted) {
        if (rawText.toLowerCase().includes('<think>') && !rawText.toLowerCase().includes('</think>')) continue
        streamingStarted = true
        const cleaned = stripThink(rawText)
        if (cleaned) {
          assistantText = cleaned
          await channel.sendStreamToken(cleaned)
        }
      } else {
        assistantText += token
        await channel.sendStreamToken(token)
      }
    }
    assistantText = stripThink(rawText)
    await channel.sendStreamEnd()
  } else if (assistantText) {
    await channel.sendMessage(assistantText)
  } else {
    assistantText = 'Ich konnte leider keine Antwort generieren.'
    await channel.sendMessage(assistantText)
  }

  db.saveMessage(sessionId, 'assistant', assistantText)
  _fireAndForget(() => extractFacts(llm, memory, displayText, assistantText))
  if (ttsEnabled) _fireAndForget(() => _sendTTS(channel, assistantText, agentScope))

  return assistantText
}

async function _executeTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  channel: ChannelAdapter,
  tools: ToolRegistry,
  allowedSkills: string[] | null,
  ctx: ToolContext,
): Promise<string> {
  if (allowedSkills !== null && !allowedSkills.includes(toolName)) {
    return `Fehler: Zugriff auf '${toolName}' nicht erlaubt.`
  }

  await channel.sendToolCall(toolName, toolArgs)
  const result = await tools.execute(toolName, toolArgs, ctx)

  // Extract images from result and send as image events
  const imgMatches = [...result.matchAll(IMG_RE)]
  for (const [, alt, src] of imgMatches) {
    await channel.sendImage(src, alt)
  }

  // Replace image markdown so the LLM doesn't repeat it
  if (imgMatches.length) {
    return result.replace(IMG_RE, '[Bild wurde angezeigt]')
  }

  return result
}

function _buildToolDefs(
  tools: ToolRegistry,
  router: AgentRouter | null,
  scope: AgentScope,
  allowedSkills: string[] | null,
): LLMToolDefinition[] {
  const filter = allowedSkills ?? scope.skills ?? undefined
  const defs = tools.getDefinitions(filter as string[] | undefined)

  if (router) {
    const allowedAgents = allowedSkills ? router.getAllowedAgents(allowedSkills) : undefined
    const delegateDef = router.getDelegate(scope.id, allowedAgents)
    if (delegateDef) defs.push(delegateDef)
  }

  return defs
}

async function _sendTTS(_channel: ChannelAdapter, _text: string, _scope: AgentScope) {
  // TTS generation would go here using edge-tts or similar
  // Left as stub for now — would generate audio and call channel.sendAudio()
}

function _fireAndForget(fn: () => Promise<void>) {
  fn().catch(err => logger.debug('Background task failed', err))
}
