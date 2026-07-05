import { type LLMClient, parseModelRef } from './client.js'
import { OllamaClient } from './ollama.js'
import { OpenAIClient } from './openai.js'
import { AnthropicClient } from './anthropic.js'
import type { ResolvedConfig } from '../config/config.js'

export function createLLMClient(modelRef: string, cfg: ResolvedConfig): LLMClient {
  const { provider, model } = parseModelRef(modelRef)
  switch (provider) {
    case 'openai':
      return new OpenAIClient({
        apiKey: cfg.openaiApiKey,
        baseUrl: cfg.openaiBaseUrl,
        model,
      })
    case 'anthropic':
      return new AnthropicClient({
        apiKey: cfg.anthropicApiKey,
        model,
      })
    case 'ollama':
    default:
      return new OllamaClient({
        baseUrl: cfg.ollamaBaseUrl,
        model: modelRef.startsWith('ollama/') ? model : modelRef,
        embeddingModel: cfg.ollamaEmbeddingModel,
      })
  }
}
