import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { loadConfig, resolvedConfig } from '../config/config.js'
import { initFileLogging, createLogger } from '../infra/logger.js'
import { Database } from '../infra/db.js'
import { OllamaClient } from '../llm/ollama.js'
import type { LLMClient } from '../llm/client.js'
import { createLLMClient } from '../llm/factory.js'
import { ToolRegistry } from '../tools/registry.js'
import { MemoryManager } from '../memory/manager.js'
import { OllamaEmbeddingClient } from '../memory/embeddings.js'
import { EventBus } from '../automation/event-bus.js'
import { SchedulerEngine } from '../scheduler/engine.js'
import { AutomationEngine } from '../automation/engine.js'
import { AgentRouter } from '../agents/router.js'

// Builtin tools
import { WebBrowseTool } from '../tools/builtin/web-browse.js'
import { WebFetchTool } from '../tools/builtin/web-fetch.js'
import { FileManagerTool } from '../tools/builtin/file-manager.js'
import { SystemCommandTool } from '../tools/builtin/system-command.js'
import { MemoryManagerTool } from '../tools/builtin/memory-manager.js'
import { CalculatorTool } from '../tools/builtin/calculator.js'
import { ProjectManagerTool } from '../tools/builtin/project-manager.js'
import { TaskSchedulerTool } from '../tools/builtin/task-scheduler.js'
import { ScreenshotTool } from '../tools/builtin/screenshot.js'
import { ClipboardTool } from '../tools/builtin/clipboard.js'
import { ImageGenerationTool } from '../tools/builtin/image-generation.js'
import { WebhookManagerTool } from '../tools/builtin/webhook-manager.js'
import { AutomationManagerTool } from '../tools/builtin/automation-manager.js'
import { BatchScriptTool } from '../tools/builtin/batch-script.js'

const logger = createLogger('deps')

export interface AppDeps {
  cfg: ReturnType<typeof resolvedConfig>
  db: Database
  llm: LLMClient
  tools: ToolRegistry
  memory: MemoryManager
  eventBus: EventBus
  scheduler: SchedulerEngine
  automationEngine: AutomationEngine
  router: AgentRouter
  cleanup: () => void
}

export function createDefaultDeps(configPath?: string): AppDeps {
  const rawCfg = loadConfig(configPath)
  const cfg = resolvedConfig(rawCfg)

  // Init logging
  mkdirSync(cfg.logDir, { recursive: true })
  initFileLogging(cfg.logDir)

  // Init data dirs
  for (const dir of [cfg.dataDir, cfg.uploadDir, cfg.generatedImagesDir, cfg.generatedAudioDir, cfg.scriptsDir]) {
    mkdirSync(dir, { recursive: true })
  }

  // Database
  const db = new Database(cfg.dbPath)

  // LLM — resolved via provider factory (ollama/, openai/, anthropic/ prefixes)
  const llm = createLLMClient(cfg.defaultModel, cfg)

  // Memory — embeddings always go through Ollama (separate client;
  // failures degrade to zero vectors inside OllamaEmbeddingClient)
  const embeddingLlm = new OllamaClient({
    baseUrl: cfg.ollamaBaseUrl,
    model: cfg.ollamaEmbeddingModel,
    embeddingModel: cfg.ollamaEmbeddingModel,
  })
  const embeddingClient = new OllamaEmbeddingClient(embeddingLlm, 768)
  const memory = new MemoryManager(db, embeddingClient)

  // Event bus
  const eventBus = new EventBus()

  // Tools
  const tools = new ToolRegistry()
  tools.register(new WebBrowseTool())
  tools.register(new WebFetchTool())
  tools.register(new FileManagerTool(cfg.allowedDirectories))
  tools.register(new SystemCommandTool())
  tools.register(new MemoryManagerTool(memory))
  tools.register(new CalculatorTool())
  tools.register(new ProjectManagerTool(db))
  tools.register(new ScreenshotTool(cfg.generatedImagesDir))
  tools.register(new ClipboardTool())
  tools.register(new WebhookManagerTool(db))
  tools.register(new AutomationManagerTool(db, eventBus))

  if (cfg.sdEnabled) {
    tools.register(new ImageGenerationTool(cfg.sdApiUrl, cfg.generatedImagesDir))
  }

  // Scheduler
  const scheduler = new SchedulerEngine(db, eventBus)
  scheduler.setToolRegistry(tools)

  // Task scheduler tool (needs scheduler ref)
  tools.register(new TaskSchedulerTool(scheduler))

  // Batch script tool
  tools.register(new BatchScriptTool(
    cfg.scriptsDir,
    (name, args, ctx) => tools.execute(name, args, ctx),
  ))

  // Automation
  const automationEngine = new AutomationEngine(db, eventBus)
  automationEngine.setToolRegistry(tools)

  // Agent router
  const router = new AgentRouter(llm, tools, cfg)

  const cleanup = () => {
    scheduler.stop()
    db.close()
    logger.info('Clara shutdown complete')
  }

  // Handle process exit
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  return { cfg, db, llm, tools, memory, eventBus, scheduler, automationEngine, router, cleanup }
}
