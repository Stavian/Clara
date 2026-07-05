import Anthropic from '@anthropic-ai/sdk'
import { type LLMClient, type LLMMessage, type LLMToolDefinition, type LLMResponse } from './client.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('llm:anthropic')

export class AnthropicClient implements LLMClient {
  readonly providerId = 'anthropic'
  readonly modelId: string
  private readonly client: Anthropic

  constructor(opts: { apiKey?: string; model: string }) {
    this.modelId = opts.model
    this.client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY })
  }

  async chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    const systemMsg = messages.find(m => m.role === 'system')
    const nonSystem = messages.filter(m => m.role !== 'system')

    const anthropicMessages = this._convertMessages(nonSystem)

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.modelId,
      max_tokens: 8096,
      messages: anthropicMessages,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      ...(tools?.length ? {
        tools: tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
        })),
      } : {}),
    }

    const response = await this.client.messages.create(params)
    return this._convertResponse(response)
  }

  private _convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = []
    for (const m of messages) {
      if (m.role === 'tool') {
        // Tool results — attach to the prior assistant message as a user message
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.name ?? 'unknown',
            content: m.content,
          }],
        })
      } else if (m.role === 'assistant' && m.tool_calls?.length) {
        result.push({
          role: 'assistant',
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.tool_calls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id ?? tc.function.name,
              name: tc.function.name,
              input: tc.function.arguments,
            })),
          ],
        })
      } else {
        result.push({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })
      }
    }
    return result
  }

  private _convertResponse(response: Anthropic.Message): LLMResponse {
    const textBlocks = response.content.filter(b => b.type === 'text') as Anthropic.TextBlock[]
    const toolBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]

    return {
      content: textBlocks.map(b => b.text).join(''),
      tool_calls: toolBlocks.length ? toolBlocks.map(b => ({
        id: b.id,
        type: 'function' as const,
        function: {
          name: b.name,
          arguments: b.input as Record<string, unknown>,
        },
      })) : undefined,
    }
  }

  async *stream(messages: LLMMessage[]): AsyncGenerator<string> {
    const systemMsg = messages.find(m => m.role === 'system')
    const nonSystem = messages.filter(m => m.role !== 'system')

    const stream = this.client.messages.stream({
      model: this.modelId,
      max_tokens: 8096,
      messages: this._convertMessages(nonSystem),
      ...(systemMsg ? { system: systemMsg.content } : {}),
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text
      }
    }
  }

  async generate(prompt: string): Promise<string> {
    const res = await this.chat([{ role: 'user', content: prompt }])
    return res.content
  }

  async embed(_text: string): Promise<number[]> {
    logger.warn('Anthropic does not support embeddings, returning empty vector')
    return []
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list()
      return true
    } catch { return false }
  }
}
