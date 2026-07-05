import type { LLMClient } from '../llm/client.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('embeddings')

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>
  readonly dimensions: number
}

export class OllamaEmbeddingClient implements EmbeddingClient {
  readonly dimensions: number
  private readonly llm: LLMClient

  constructor(llm: LLMClient, dimensions = 768) {
    this.llm = llm
    this.dimensions = dimensions
  }

  async embed(text: string): Promise<number[]> {
    try {
      return await this.llm.embed(text)
    } catch (err) {
      logger.warn('Embedding failed, returning zero vector', err)
      return new Array(this.dimensions).fill(0)
    }
  }
}
