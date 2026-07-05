import { Type, type Static } from '@sinclair/typebox'

const AgentConfig = Type.Object({
  id: Type.String(),
  description: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  skills: Type.Optional(Type.Array(Type.String())),
  maxRounds: Type.Optional(Type.Number()),
  temperature: Type.Optional(Type.Number()),
  contextWindow: Type.Optional(Type.Number()),
  default: Type.Optional(Type.Boolean()),
})

const BindingConfig = Type.Object({
  channel: Type.String(),
  agentId: Type.String(),
  peer: Type.Optional(Type.String()),
  account: Type.Optional(Type.String()),
})

const ModelRef = Type.Object({
  id: Type.String(),
  contextWindow: Type.Optional(Type.Number()),
  maxTokens: Type.Optional(Type.Number()),
  costPer1k: Type.Optional(Type.Number()),
})

const OllamaProvider = Type.Object({
  baseUrl: Type.Optional(Type.String()),
  embeddingModel: Type.Optional(Type.String()),
  models: Type.Optional(Type.Array(ModelRef)),
})

const OpenAIProvider = Type.Object({
  apiKey: Type.Optional(Type.String()),
  baseUrl: Type.Optional(Type.String()),
  models: Type.Optional(Type.Array(ModelRef)),
})

const AnthropicProvider = Type.Object({
  apiKey: Type.Optional(Type.String()),
  models: Type.Optional(Type.Array(ModelRef)),
})

export const ClaraConfigSchema = Type.Object({
  gateway: Type.Optional(Type.Object({
    host: Type.Optional(Type.String()),
    port: Type.Optional(Type.Number()),
    auth: Type.Optional(Type.Union([
      Type.Literal('none'),
      Type.Literal('token'),
      Type.Literal('password'),
    ])),
    password: Type.Optional(Type.String()),
    jwtSecret: Type.Optional(Type.String()),
  })),
  agents: Type.Optional(Type.Object({
    defaults: Type.Optional(Type.Object({
      model: Type.Optional(Type.String()),
      maxRounds: Type.Optional(Type.Number()),
      contextWindow: Type.Optional(Type.Number()),
    })),
    list: Type.Optional(Type.Array(AgentConfig)),
    bindings: Type.Optional(Type.Array(BindingConfig)),
  })),
  models: Type.Optional(Type.Object({
    providers: Type.Optional(Type.Object({
      ollama: Type.Optional(OllamaProvider),
      openai: Type.Optional(OpenAIProvider),
      anthropic: Type.Optional(AnthropicProvider),
    })),
  })),
  memory: Type.Optional(Type.Object({
    default: Type.Optional(Type.Object({
      enabled: Type.Optional(Type.Boolean()),
      provider: Type.Optional(Type.String()),
    })),
  })),
  channels: Type.Optional(Type.Object({
    webchat: Type.Optional(Type.Object({
      enabled: Type.Optional(Type.Boolean()),
    })),
    discord: Type.Optional(Type.Object({
      token: Type.Optional(Type.String()),
      ownerId: Type.Optional(Type.String()),
      publicSkills: Type.Optional(Type.Array(Type.String())),
    })),
  })),
  sd: Type.Optional(Type.Object({
    enabled: Type.Optional(Type.Boolean()),
    apiUrl: Type.Optional(Type.String()),
    forgeDir: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
  })),
  allowedDirectories: Type.Optional(Type.Array(Type.String())),
  ttsVoice: Type.Optional(Type.String()),
  maxConversationHistory: Type.Optional(Type.Number()),
  heartbeatIntervalMinutes: Type.Optional(Type.Number()),
  dataDir: Type.Optional(Type.String()),
  logDir: Type.Optional(Type.String()),
  scriptsDir: Type.Optional(Type.String()),
  agentTemplatesDir: Type.Optional(Type.String()),
  uploadDir: Type.Optional(Type.String()),
  generatedImagesDir: Type.Optional(Type.String()),
  generatedAudioDir: Type.Optional(Type.String()),
})

export type ClaraConfig = Static<typeof ClaraConfigSchema>
export type AgentConfigEntry = Static<typeof AgentConfig>
export type BindingConfigEntry = Static<typeof BindingConfig>
