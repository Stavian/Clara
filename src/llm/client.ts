export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id?: string
    type?: 'function'
    function: { name: string; arguments: Record<string, unknown> }
  }>
  name?: string
  images?: string[]
}

export interface LLMToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMResponse {
  content: string
  tool_calls?: Array<{
    id?: string
    type?: 'function'
    function: { name: string; arguments: Record<string, unknown> }
  }>
}

export interface LLMClient {
  readonly providerId: string
  readonly modelId: string
  chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse>
  stream(messages: LLMMessage[]): AsyncGenerator<string>
  embed(text: string): Promise<number[]>
  generate(prompt: string): Promise<string>
  isAvailable(): Promise<boolean>
}

/** Parse a model string like "ollama/qwen3:14b" or "openai/gpt-4o" */
export function parseModelRef(modelRef: string): { provider: string; model: string } {
  const idx = modelRef.indexOf('/')
  if (idx === -1) return { provider: 'ollama', model: modelRef }
  return { provider: modelRef.slice(0, idx), model: modelRef.slice(idx + 1) }
}

const _THINK_RE = /<think>[\s\S]*?<\/think>\s*/gi
const _TOOL_CALL_RE = /<tool_call>[\s\S]*?<\/tool_call>\s*/gi

/** Strip <think> blocks, <tool_call> blocks and CJK filler lines from LLM output. */
export function stripThink(text: string): string {
  text = text.replace(_THINK_RE, '')
  text = text.replace(_TOOL_CALL_RE, '')

  // Handle unclosed <think>: drop everything from <think> onward
  const openIdx = text.toLowerCase().lastIndexOf('<think>')
  if (openIdx !== -1) text = text.slice(0, openIdx)

  // Handle orphan </think>: drop everything up to and including it
  const closeIdx = text.toLowerCase().lastIndexOf('</think>')
  if (closeIdx !== -1) text = text.slice(closeIdx + '</think>'.length)

  // Drop lines with only non-Latin characters (CJK filler)
  const lines = text.split('\n')
  const cleaned = lines.filter(line => {
    const stripped = line.trim()
    if (!stripped) return true
    return /[a-zA-Z0-9äöüÄÖÜß]/.test(stripped)
  })

  return cleaned.join('\n').trim()
}
