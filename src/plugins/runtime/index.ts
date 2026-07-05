import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'
import type { ClaraPlugin, PluginHooks } from '../types.js'
import type { AppDeps } from '../../cli/deps.js'
import { createLogger } from '../../infra/logger.js'

const logger = createLogger('plugins')

export class PluginRuntime {
  private readonly plugins: ClaraPlugin[] = []
  private readonly jiti = createJiti(import.meta.url)

  async loadFromDir(extensionsDir: string): Promise<void> {
    if (!existsSync(extensionsDir)) return

    for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const pluginDir = path.join(extensionsDir, entry.name)
      const candidates = [
        path.join(pluginDir, 'src', 'index.ts'),
        path.join(pluginDir, 'src', 'index.js'),
        path.join(pluginDir, 'index.ts'),
        path.join(pluginDir, 'index.js'),
      ]
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          try {
            const mod = await this.jiti.import(candidate) as { default?: ClaraPlugin } | ClaraPlugin
            const plugin = (mod as { default?: ClaraPlugin }).default ?? (mod as ClaraPlugin)
            if (plugin?.name) {
              this.plugins.push(plugin)
              logger.info(`Plugin loaded: ${plugin.name}`)
            }
          } catch (err) {
            logger.error(`Failed to load plugin from ${candidate}`, err)
          }
          break
        }
      }
    }
  }

  async runHook<K extends keyof PluginHooks>(
    hook: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin.hooks?.[hook] as ((...a: unknown[]) => Promise<void>) | undefined
      if (fn) {
        try {
          await fn(...args)
        } catch (err) {
          logger.error(`Plugin '${plugin.name}' hook '${hook}' failed`, err)
        }
      }
    }
  }

  registerTools(deps: AppDeps): void {
    for (const plugin of this.plugins) {
      for (const toolDef of plugin.tools ?? []) {
        try {
          const tool = toolDef.create(deps)
          deps.tools.register(tool)
          logger.info(`Plugin tool registered: ${toolDef.name}`)
        } catch (err) {
          logger.error(`Failed to create plugin tool ${toolDef.name}`, err)
        }
      }
    }
  }

  getPlugins(): ClaraPlugin[] {
    return [...this.plugins]
  }
}
