import Fastify from 'fastify'
import fastifyWs from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import { randomUUID } from 'node:crypto'
import { createWriteStream, mkdirSync, statSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { WebSocket } from '@fastify/websocket'

import type { ResolvedConfig } from '../config/config.js'
import type { Database } from '../infra/db.js'
import type { LLMClient } from '../llm/client.js'
import { OllamaClient } from '../llm/ollama.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { MemoryManager } from '../memory/manager.js'
import { AuthService } from './auth.js'
import { handleAgentCall, type AgentRouter } from './call.js'
import { WebSocketAdapter } from '../channels/webchat/channel.js'
import { resolveAgentScope, getDefaultAgentId } from '../agents/agent-scope.js'
import type { EventBus } from '../automation/event-bus.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('gateway')

interface GatewayDeps {
  cfg: ResolvedConfig
  db: Database
  llm: LLMClient
  tools: ToolRegistry
  memory: MemoryManager
  eventBus: EventBus
  router: AgentRouter | null
}

export async function startGateway(deps: GatewayDeps) {
  const { cfg, db, llm, tools, memory, eventBus, router } = deps

  const auth = new AuthService({
    mode: cfg.authMode as 'none' | 'token' | 'password',
    password: cfg.password,
    jwtSecret: cfg.jwtSecret,
  })

  const app = Fastify({ logger: false })

  await app.register(fastifyWs)
  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  // Serve generated images
  const { generatedImagesDir, generatedAudioDir, uploadDir, staticDir } = cfg
  mkdirSync(generatedImagesDir, { recursive: true })
  mkdirSync(generatedAudioDir, { recursive: true })
  mkdirSync(uploadDir, { recursive: true })

  await app.register(fastifyStatic, {
    root: staticDir,
    prefix: '/static/',
    decorateReply: true,
  })

  await app.register(fastifyStatic, {
    root: generatedImagesDir,
    prefix: '/generated/',
    decorateReply: false,
  })

  await app.register(fastifyStatic, {
    root: generatedAudioDir,
    prefix: '/generated/audio/',
    decorateReply: false,
  })

  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
  })


  function checkAuth(token: string | undefined): boolean {
    if (!auth.isEnabled()) return true
    return auth.verifyToken(token)
  }

  function getBearerToken(request: { headers: { authorization?: string } }): string | undefined {
    const h = request.headers.authorization
    if (h?.startsWith('Bearer ')) return h.slice(7)
    return undefined
  }

  // ============ Routes ============

  // Serve index.html at /
  app.get('/', async (_req, reply) => {
    const indexPath = path.join(staticDir, 'index.html')
    return reply.sendFile('index.html', staticDir)
  })

  // Auth endpoints
  app.get('/api/auth/check', async () => ({ auth_enabled: auth.isEnabled() }))

  app.post('/api/auth/login', async (request, reply) => {
    if (!auth.isEnabled()) return { token: 'disabled', auth_enabled: false }
    const body = request.body as { password?: string }
    if (!auth.verifyPassword((body?.password ?? '').trim())) {
      return reply.code(401).send({ error: 'Falsches Passwort' })
    }
    return { token: auth.createToken(), auth_enabled: true }
  })

  // Health
  app.get('/health', async () => {
    const ollamaOk = await (llm as OllamaClient).isAvailable?.() ?? false
    return { status: ollamaOk ? 'ok' : 'degraded', ollama: ollamaOk }
  })

  app.get('/api/health', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const ollamaOk = await (llm as OllamaClient).isAvailable?.() ?? false
    return { status: ollamaOk ? 'ok' : 'degraded', ollama: ollamaOk }
  })

  // Agents list
  app.get('/api/agents', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    if (!router) return { agents: [] }
    const { listAgentIds: listIds, resolveAgentScope: getScope } = await import('../agents/agent-scope.js')
    const defaultId = getDefaultAgentId(cfg)
    const agents = listIds(cfg)
      .filter(id => id !== defaultId)
      .map(id => {
        const scope = getScope(id, cfg)
        return { name: id, description: scope.description, model: scope.model }
      })
    return { agents }
  })

  // Upload
  app.post('/api/upload', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'Keine Datei' })

    const allowed = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    if (!allowed.has(data.mimetype)) {
      return reply.code(400).send({ error: 'Nur Bilder erlaubt (PNG, JPEG, GIF, WEBP)' })
    }

    const ext = data.filename.includes('.') ? data.filename.split('.').pop() : 'png'
    const filename = `${randomUUID().replace(/-/g, '')}.${ext}`
    const filepath = path.join(uploadDir, filename)

    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(filepath)
      data.file.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
    })

    return { path: `/uploads/${filename}`, filename }
  })

  // Dashboard stats
  app.get('/api/dashboard/stats', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    return {
      conversations: db.countConversations(),
      memories: db.countMemories(),
      projects: db.projectStats(),
      tasks: db.taskStats(),
    }
  })

  app.get('/api/dashboard/status', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const ollamaOk = await (llm as OllamaClient).isAvailable?.() ?? false
    return {
      ollama: ollamaOk,
      stable_diffusion: false,
      discord: Boolean(cfg.discordToken),
      model: cfg.defaultModel,
    }
  })

  app.get('/api/dashboard/activity', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    return { events: eventBus.getRecentEvents(15) }
  })

  app.get('/api/dashboard/storage', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })

    const dirSize = (dir: string): number => {
      try {
        return readdirSync(dir, { recursive: true } as Parameters<typeof readdirSync>[1]).reduce((acc, f) => {
          try { return acc + statSync(path.join(dir, String(f))).size } catch { return acc }
        }, 0)
      } catch { return 0 }
    }

    const dbPath = cfg.dbPath
    let dbSize = 0
    try { dbSize = statSync(dbPath).size } catch { /* ok */ }

    return {
      db_size: dbSize,
      images_size: dirSize(generatedImagesDir),
      audio_size: dirSize(generatedAudioDir),
      uploads_size: dirSize(uploadDir),
      total_size: dirSize(path.dirname(dbPath)),
      memory_by_category: db.memoryByCategory(),
      conversations: db.countConversations(),
    }
  })

  // Settings
  app.get('/api/settings/models', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const models = await (llm as OllamaClient).listModelsRaw?.() ?? []
    return { models, current: cfg.defaultModel }
  })

  app.get('/api/settings/memories', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const query = (request.query as Record<string, string>).category
    const categories = db.getAllCategories()
    const memories = query
      ? db.recallCategory(query).map(m => ({ category: query, ...m }))
      : db.getRecentMemories(100)
    return { categories, memories }
  })

  app.delete('/api/settings/memories/:category/:key', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const { category, key } = request.params as { category: string; key: string }
    db.forget(category, key)
    return { status: 'ok' }
  })

  app.get('/api/settings/config', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    return {
      ollama_url: cfg.ollamaBaseUrl,
      db_path: cfg.dbPath,
      model: cfg.defaultModel,
      embedding_model: cfg.ollamaEmbeddingModel,
      tts_voice: cfg.ttsVoice,
      host: cfg.host,
      port: cfg.port,
    }
  })

  // Projects
  app.get('/api/projects', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    return { projects: db.listProjectsWithTaskCounts() }
  })

  app.post('/api/projects', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const body = request.body as { name?: string; description?: string }
    const name = (body?.name ?? '').trim()
    if (!name) return reply.code(400).send({ error: 'Projektname erforderlich' })
    if (db.getProjectByName(name)) return reply.code(409).send({ error: 'Projekt existiert bereits' })
    return db.createProject(name, body.description ?? '')
  })

  app.put('/api/projects/:id', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const id = Number((request.params as { id: string }).id)
    if (!db.getProjectById(id)) return reply.code(404).send({ error: 'Nicht gefunden' })
    const body = request.body as Record<string, unknown>
    db.updateProject(id, body)
    return { status: 'ok' }
  })

  app.delete('/api/projects/:id', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const id = Number((request.params as { id: string }).id)
    if (!db.getProjectById(id)) return reply.code(404).send({ error: 'Nicht gefunden' })
    db.deleteProject(id)
    return { status: 'ok' }
  })

  app.get('/api/projects/:id/tasks', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const id = Number((request.params as { id: string }).id)
    return { tasks: db.listTasksByProject(id) }
  })

  app.post('/api/projects/:id/tasks', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const projectId = Number((request.params as { id: string }).id)
    if (!db.getProjectById(projectId)) return reply.code(404).send({ error: 'Projekt nicht gefunden' })
    const body = request.body as { title?: string; description?: string; priority?: number }
    const title = (body?.title ?? '').trim()
    if (!title) return reply.code(400).send({ error: 'Titel erforderlich' })
    return db.addTask(projectId, title, body.description ?? '', body.priority ?? 0)
  })

  app.put('/api/tasks/:id', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const id = Number((request.params as { id: string }).id)
    const body = request.body as Record<string, unknown>
    db.updateTask(id, body)
    return { status: 'ok' }
  })

  app.delete('/api/tasks/:id', async (request, reply) => {
    if (!checkAuth(getBearerToken(request))) return reply.code(401).send({ error: 'Unauthorized' })
    const id = Number((request.params as { id: string }).id)
    db.deleteTask(id)
    return { status: 'ok' }
  })

  // Webhook receiver
  app.post('/api/webhooks/:name', async (request, reply) => {
    const name = (request.params as { name: string }).name
    const hook = db.getWebhook(name)
    if (!hook) return reply.code(404).send({ error: 'Webhook nicht gefunden' })
    eventBus.emit(String(hook.event_type), request.body, `webhook:${name}`)
    return { status: 'ok' }
  })

  // ============ WebSocket Chat ============
  app.get('/api/chat', { websocket: true }, (socket: WebSocket, request) => {
    const token = (request.query as Record<string, string>).token
    if (auth.isEnabled() && !auth.verifyToken(token)) {
      socket.close(4401, 'Unauthorized')
      return
    }

    const sessionId = randomUUID()
    logger.info(`New WebSocket session: ${sessionId}`)

    const defaultAgentId = getDefaultAgentId(cfg)
    const agentScope = resolveAgentScope(defaultAgentId, cfg)

    socket.on('message', async (rawData: Buffer) => {
      try {
        const data = JSON.parse(rawData.toString()) as {
          message?: string
          tts?: boolean
          image?: string
          agent?: string
        }

        const userMessage = (data.message ?? '').trim()
        const ttsEnabled = data.tts ?? false
        const imagePath = data.image
        const agentOverride = data.agent

        if (!userMessage && !imagePath) return

        // Load image if provided
        let imageBase64: string | undefined
        if (imagePath) {
          const filename = imagePath.split('/').pop() ?? ''
          const fullPath = path.join(uploadDir, filename)
          try {
            const imgBytes = await readFile(fullPath)
            imageBase64 = imgBytes.toString('base64')
          } catch { /* image not found */ }
        }

        const adapter = new WebSocketAdapter(socket)

        // Re-resolve agent scope if override
        const scope = agentOverride && agentOverride !== 'general'
          ? resolveAgentScope(agentOverride, cfg)
          : agentScope

        await handleAgentCall({
          channel: adapter,
          llm,
          db,
          tools,
          memory,
          agentScope: scope,
          router,
          sessionId,
          userMessage,
          imageBase64,
          ttsEnabled,
          allowedSkills: null,
          agentOverride,
          maxConversationHistory: cfg.maxConversationHistory,
        })
      } catch (err) {
        logger.error('WebSocket message error', err)
        try {
          socket.send(JSON.stringify({ type: 'error', content: `Fehler: ${err instanceof Error ? err.message : String(err)}` }))
        } catch { /* client gone */ }
      }
    })

    socket.on('close', () => {
      logger.info(`Session ${sessionId} disconnected`)
    })
  })

  // Start server
  await app.listen({ host: cfg.host, port: cfg.port })
  logger.info(`Clara gateway running at http://${cfg.host}:${cfg.port}`)

  return app
}
