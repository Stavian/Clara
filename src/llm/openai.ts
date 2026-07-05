import OpenAI from 'openai'
import { type LLMClient, type LLMMessage, type LLMToolDefinition, type LLMResponse } from './client.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('llm:openai')

export class OpenAIClient implements LLMClient {
  readonly providerId = 'openai'
  readonly modelId: string
  private readonly client: OpenAI

  constructor(opts: {
    apiKey?: string
    baseUrl?: string
    model: string
  }) {
    this.modelId = opts.model
    this.client = new OpenAI({
      apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY ?? 'sk-none',
      baseURL: opts.baseUrl,
    })
  }

  private _toOpenAI(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.name ?? 'unknown',
        } satisfies OpenAI.Chat.ChatCompletionToolMessageParam
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls.map(tc => ({
            id: tc.id ?? tc.function.name,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: JSON.stringify(tc.function.arguments),
            },
          })),
        } satisfies OpenAI.Chat.ChatCompletionAssistantMessageParam
      }
      if (m.role === 'user' && m.images?.length) {
        return {
          role: 'user',
          content: [
            { type: 'text', text: m.content },
            ...m.images.map(img => ({
              type: 'image_url' as const,
              image_url: { url: `data:image/jpeg;base64,${img}` },
            })),
          ],
        } satisfies OpenAI.Chat.ChatCompletionUserMessageParam
      }
      return { role: m.role as 'system' | 'user' | 'assistant', content: m.content }
    })
  }

  async chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages: this._toOpenAI(messages),
      tools: tools?.length ? tools : undefined,
    })
    const choice = response.choices[0]
    const msg = choice?.message
    return {
      content: msg?.content ?? '',
      tool_calls: msg?.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: (() => {
            try { return JSON.parse(tc.function.arguments) as Record<string, unknown> }
            catch { return {} }
          })(),
        },
      })),
    }
  }

  async *stream(messages: LLMMessage[]): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.modelId,
      messages: this._toOpenAI(messages),
      stream: true,
    })
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content
      if (token) yield token
    }
  }

  async generate(prompt: string): Promise<string> {
    const res = await this.chat([{ role: 'user', content: prompt }])
    return res.content
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    return res.data[0]?.embedding ?? []
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list()
      return true
    } catch { return false }
  }
}
