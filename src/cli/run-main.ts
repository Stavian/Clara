import { Command } from 'commander'
import { createDefaultDeps } from './deps.js'
import { startGateway } from '../gateway/server.js'
import { loadConfig, resolvedConfig, getConfigPath } from '../config/config.js'
import { createLogger } from '../infra/logger.js'
import { listAgentIds, resolveAgentScope } from '../agents/agent-scope.js'

const logger = createLogger('cli')

export function buildCLI(): Command {
  const program = new Command()
    .name('clara')
    .description('Clara AI Assistant')
    .version('2.0.0')

  // ---- gateway ----
  const gateway = program.command('gateway').description('Gateway management')

  gateway.command('run')
    .description('Start the Clara gateway server')
    .option('--config <path>', 'Config file path')
    .option('--port <port>', 'Override port', parseInt)
    .option('--host <host>', 'Override host')
    .action(async (opts) => {
      const deps = createDefaultDeps(opts.config)
      const { cfg, db, llm, tools, memory, eventBus, scheduler, automationEngine, router } = deps

      // Apply CLI overrides
      if (opts.port) (cfg as { port: number }).port = opts.port
      if (opts.host) (cfg as { host: string }).host = opts.host

      // Start subsystems
      scheduler.start()
      automationEngine.start()

      logger.info(`Starting Clara gateway on ${cfg.host}:${cfg.port}`)
      logger.info(`Main model: ${cfg.defaultModel}`)
      logger.info(`Tools: ${tools.getAll().map(t => t.name).join(', ')}`)

      await startGateway({ cfg, db, llm, tools, memory, eventBus, router })
    })

  // ---- config ----
  const config = program.command('config').description('Configuration management')

  config.command('get [key]')
    .description('Get config value(s)')
    .option('--config <path>', 'Config file path')
    .action((key, opts) => {
      const raw = loadConfig(opts.config)
      if (key) {
        const val = key.split('.').reduce((o: Record<string, unknown>, k: string) => o?.[k] as Record<string, unknown>, raw as unknown as Record<string, unknown>)
        console.log(JSON.stringify(val, null, 2))
      } else {
        console.log(JSON.stringify(raw, null, 2))
      }
    })

  config.command('path')
    .description('Show config file path')
    .action(() => console.log(getConfigPath()))

  // ---- agent ----
  const agent = program.command('agent').description('Agent management')

  agent.command('list')
    .description('List all agents')
    .option('--config <path>', 'Config file path')
    .action((opts) => {
      const raw = loadConfig(opts.config)
      const cfg = resolvedConfig(raw)
      const ids = listAgentIds(cfg)
      console.log('\nAvailable agents:')
      for (const id of ids) {
        const scope = resolveAgentScope(id, cfg)
        console.log(`  ${id.padEnd(15)} ${scope.model.padEnd(30)} ${scope.description}`)
      }
    })

  // ---- memory ----
  const memory = program.command('memory').description('Memory management')

  memory.command('search <query>')
    .description('Search memory')
    .option('--config <path>', 'Config file path')
    .option('--limit <n>', 'Max results', parseInt)
    .action(async (query, opts) => {
      const deps = createDefaultDeps(opts.config)
      const results = await deps.memory.search(query, opts.limit ?? 10)
      if (!results.length) {
        console.log('No results found.')
      } else {
        for (const r of results) {
          console.log(`[${r.category}] ${r.key}: ${r.value}`)
        }
      }
      deps.cleanup()
    })

  memory.command('list [category]')
    .description('List memory entries')
    .option('--config <path>', 'Config file path')
    .action((category, opts) => {
      const deps = createDefaultDeps(opts.config)
      const entries = category
        ? deps.db.recallCategory(category).map(m => ({ ...m, category }))
        : deps.db.getRecentMemories(50)
      if (!entries.length) {
        console.log('No entries found.')
      } else {
        for (const e of entries) {
          console.log(`[${(e as { category: string }).category}] ${e.key}: ${e.value}`)
        }
      }
      deps.cleanup()
    })

  return program
}
