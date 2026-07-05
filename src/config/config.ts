import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import JSON5 from 'json5'
import { Value } from '@sinclair/typebox/value'
import { ClaraConfigSchema, type ClaraConfig } from './types.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('config')

const CONFIG_DIR = path.join(os.homedir(), '.clara')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json5')

/** Expand $ENV_VAR references in string values */
function expandEnv(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, k) => process.env[k] ?? `$${k}`)
  }
  if (Array.isArray(obj)) return obj.map(expandEnv)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, expandEnv(v)])
    )
  }
  return obj
}

export function loadConfig(configPath = CONFIG_FILE): ClaraConfig {
  let raw: unknown = {}

  if (existsSync(configPath)) {
    try {
      const text = readFileSync(configPath, 'utf-8')
      raw = JSON5.parse(text)
      logger.info(`Config loaded from ${configPath}`)
    } catch (err) {
      logger.error(`Failed to parse config at ${configPath}`, err)
    }
  } else {
    logger.warn(`Config not found at ${configPath}, using defaults`)
  }

  raw = expandEnv(raw)

  // Merge environment variable overrides
  const envOverrides: ClaraConfig = {}
  if (process.env.OLLAMA_BASE_URL) {
    envOverrides.models = { providers: { ollama: { baseUrl: process.env.OLLAMA_BASE_URL } } }
  }
  if (process.env.OLLAMA_MODEL) {
    if (!envOverrides.agents) envOverrides.agents = {}
    if (!envOverrides.agents.defaults) envOverrides.agents.defaults = {}
    envOverrides.agents.defaults.model = process.env.OLLAMA_MODEL
  }
  if (process.env.PORT) {
    if (!envOverrides.gateway) envOverrides.gateway = {}
    envOverrides.gateway.port = parseInt(process.env.PORT, 10)
  }
  if (process.env.HOST) {
    if (!envOverrides.gateway) envOverrides.gateway = {}
    envOverrides.gateway.host = process.env.HOST
  }
  if (process.env.WEB_PASSWORD) {
    if (!envOverrides.gateway) envOverrides.gateway = {}
    envOverrides.gateway.auth = 'password'
    envOverrides.gateway.password = process.env.WEB_PASSWORD
  }
  if (process.env.JWT_SECRET) {
    if (!envOverrides.gateway) envOverrides.gateway = {}
    envOverrides.gateway.jwtSecret = process.env.JWT_SECRET
  }
  if (process.env.DISCORD_BOT_TOKEN) {
    if (!envOverrides.channels) envOverrides.channels = {}
    if (!envOverrides.channels.discord) envOverrides.channels.discord = {}
    envOverrides.channels.discord.token = process.env.DISCORD_BOT_TOKEN
  }
  if (process.env.DISCORD_OWNER_ID) {
    if (!envOverrides.channels) envOverrides.channels = {}
    if (!envOverrides.channels.discord) envOverrides.channels.discord = {}
    envOverrides.channels.discord.ownerId = process.env.DISCORD_OWNER_ID
  }
  if (process.env.SD_ENABLED === 'true') {
    if (!envOverrides.sd) envOverrides.sd = {}
    envOverrides.sd.enabled = true
    if (process.env.SD_API_URL) envOverrides.sd.apiUrl = process.env.SD_API_URL
    if (process.env.SD_FORGE_DIR) envOverrides.sd.forgeDir = process.env.SD_FORGE_DIR
  }

  const merged = deepMerge(raw as ClaraConfig, envOverrides)

  if (!Value.Check(ClaraConfigSchema, merged)) {
    const errors = [...Value.Errors(ClaraConfigSchema, merged)]
    logger.warn(`Config validation warnings: ${errors.map(e => `${e.path}: ${e.message}`).join(', ')}`)
  }

  return merged as ClaraConfig
}

export function resolvedConfig(cfg: ClaraConfig) {
  const projectDir = process.cwd()
  const dataDir = cfg.dataDir
    ? path.resolve(cfg.dataDir)
    : path.join(projectDir, 'data')

  return {
    host: cfg.gateway?.host ?? '127.0.0.1',
    port: cfg.gateway?.port ?? 8080,
    authMode: cfg.gateway?.auth ?? (cfg.gateway?.password ? 'password' : 'none'),
    password: cfg.gateway?.password,
    jwtSecret: cfg.gateway?.jwtSecret ?? '',

    defaultModel: cfg.agents?.defaults?.model ?? 'ollama/huihui_ai/qwen3-abliterated:14b',
    maxConversationHistory: cfg.maxConversationHistory ?? 20,
    heartbeatIntervalMinutes: cfg.heartbeatIntervalMinutes ?? 5,

    ollamaBaseUrl: cfg.models?.providers?.ollama?.baseUrl ?? 'http://localhost:11434',
    ollamaEmbeddingModel: cfg.models?.providers?.ollama?.embeddingModel ?? 'nomic-embed-text',
    openaiApiKey: cfg.models?.providers?.openai?.apiKey,
    openaiBaseUrl: cfg.models?.providers?.openai?.baseUrl,
    anthropicApiKey: cfg.models?.providers?.anthropic?.apiKey,

    discordToken: cfg.channels?.discord?.token,
    discordOwnerId: cfg.channels?.discord?.ownerId,
    discordPublicSkills: cfg.channels?.discord?.publicSkills ?? ['web_browse', 'web_fetch', 'image_generation'],

    sdEnabled: cfg.sd?.enabled ?? false,
    sdApiUrl: cfg.sd?.apiUrl ?? 'http://127.0.0.1:7860',
    sdForgeDir: cfg.sd?.forgeDir,

    allowedDirectories: cfg.allowedDirectories ?? null,
    ttsVoice: cfg.ttsVoice ?? 'de-DE-KatjaNeural',

    dataDir,
    dbPath: path.join(dataDir, 'clara.db'),
    logDir: cfg.logDir ? path.resolve(cfg.logDir) : path.join(dataDir, 'logs'),
    scriptsDir: cfg.scriptsDir ? path.resolve(cfg.scriptsDir) : path.join(dataDir, 'scripts'),
    agentTemplatesDir: cfg.agentTemplatesDir
      ? path.resolve(cfg.agentTemplatesDir)
      : path.join(dataDir, 'agent_templates'),
    uploadDir: cfg.uploadDir ? path.resolve(cfg.uploadDir) : path.join(dataDir, 'uploads'),
    generatedImagesDir: cfg.generatedImagesDir
      ? path.resolve(cfg.generatedImagesDir)
      : path.join(dataDir, 'generated_images'),
    generatedAudioDir: cfg.generatedAudioDir
      ? path.resolve(cfg.generatedAudioDir)
      : path.join(dataDir, 'generated_audio'),

    staticDir: path.join(projectDir, 'web', 'static'),
    agentList: cfg.agents?.list ?? [],
    bindings: cfg.agents?.bindings ?? [],
    agentDefaults: cfg.agents?.defaults ?? {},
    rawConfig: cfg,
  }
}

export type ResolvedConfig = ReturnType<typeof resolvedConfig>

export function saveConfig(cfg: ClaraConfig, configPath = CONFIG_FILE) {
  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON5.stringify(cfg, null, 2), 'utf-8')
  logger.info(`Config saved to ${configPath}`)
}

export function getConfigPath() {
  return CONFIG_FILE
}

function deepMerge<T>(base: T, override: T): T {
  if (!override) return base
  if (!base) return override
  if (typeof base !== 'object' || Array.isArray(base)) return override ?? base

  const result = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'object' && !Array.isArray(v) && typeof result[k] === 'object' && !Array.isArray(result[k])) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result as T
}
