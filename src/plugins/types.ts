import type { ToolDefinition } from '../tools/registry.js'
import type { Channel } from '../channels/types.js'
import type { AppDeps } from '../cli/deps.js'

export interface PluginHooks {
  'gateway:startup'?: (deps: AppDeps) => Promise<void>
  'agent:call'?: (deps: AppDeps, ctx: { agentId: string; sessionId: string }) => Promise<void>
  'message:inbound'?: (deps: AppDeps, msg: { content: string; channel: string }) => Promise<void>
}

export interface ClaraPlugin {
  name: string
  version?: string
  hooks?: PluginHooks
  channels?: Record<string, () => Channel>
  tools?: Array<{ name: string; create: (deps: AppDeps) => import('../tools/registry.js').Tool }>
}
