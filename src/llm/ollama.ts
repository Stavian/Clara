import { type LLMClient, type LLMMessage, type LLMToolDefinition, type LLMResponse, stripThink } from './client.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('llm:ollama')

export class OllamaClient implements LLMClient {
  readonly providerId = 'ollama'
  readonly modelId: string
  readonly baseUrl: string
  readonly embeddingModel: string

  constructor(opts: {
    baseUrl?: string
    model: string
    embeddingModel?: string
  }) {
    this.baseUrl = (opts.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
    this.modelId = opts.model
    this.embeddingModel = opts.embeddingModel ?? 'nomic-embed-text'
  }

  async chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    const payload: Record<string, unknown> = {
      model: this.modelId,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.name ? { name: m.name } : {}),
        ...(m.images ? { images: m.images } : {}),
      })),
      stream: false,
    }
    if (tools?.length) payload.tools = tools

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300_000),
    })
    if (!resp.ok) throw new Error(`Ollama chat failed: ${resp.status} ${resp.statusText}`)
    const data = await resp.json() as { message?: { content?: string; tool_calls?: unknown[] } }
    const msg = data.message ?? {}
    return {
      content: msg.content ?? '',
      tool_calls: (msg.tool_calls as LLMResponse['tool_calls']) ?? undefined,
    }
  }

  async *stream(messages: LLMMessage[]): AsyncGenerator<string> {
    const payload = {
      model: this.modelId,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.images ? { images: m.images } : {}),
      })),
      stream: true,
    }

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    })
    if (!resp.ok) throw new Error(`Ollama stream failed: ${resp.status}`)
    if (!resp.body) return

    const reader = resp.body.getReader()
    const dec = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
          const token = data.message?.content ?? ''
          if (token) yield token
          if (data.done) return
        } catch { /* skip malformed */ }
      }
    }
  }

  async generate(prompt: string): Promise<string> {
    const payload = { model: this.modelId, prompt, stream: false }
    const resp = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    })
    if (!resp.ok) throw new Error(`Ollama generate failed: ${resp.status}`)
    const data = await resp.json() as { response?: string }
    return data.response ?? ''
  }

  async embed(text: string): Promise<number[]> {
    const payload = { model: this.embeddingModel, input: text }
    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
    if (!resp.ok) throw new Error(`Ollama embed failed: ${resp.status}`)
    const data = await resp.json() as { embeddings?: number[][] }
    return data.embeddings?.[0] ?? []
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
      return resp.ok
    } catch { return false }
  }

  async listModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
      if (!resp.ok) return []
      const data = await resp.json() as { models?: Array<{ name: string }> }
      return (data.models ?? []).map(m => m.name)
    } catch { return [] }
  }

  async listModelsRaw(): Promise<unknown[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
      if (!resp.ok) return []
      const data = await resp.json() as { models?: unknown[] }
      return data.models ?? []
    } catch { return [] }
  }
}
