import type { Database } from '../infra/db.js'
import type { EventBus } from './event-bus.js'
import type { ToolRegistry, ToolContext } from '../tools/registry.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('automation')

interface AutomationAction {
  type: 'run_skill' | 'run_script' | 'send_notification' | 'send_message'
  skill?: string
  args?: Record<string, unknown>
  message?: string
  channel?: string
}

export class AutomationEngine {
  private tools: ToolRegistry | null = null

  constructor(
    private readonly db: Database,
    private readonly eventBus: EventBus,
  ) {}

  setToolRegistry(tools: ToolRegistry) {
    this.tools = tools
  }

  start() {
    this.eventBus.onAny(event => this._handleEvent(event.type, event.data))
    logger.info('Automation engine started')
  }

  private async _handleEvent(eventType: string, data: unknown) {
    const rules = this.db.listAutomationRules()
    for (const rule of rules) {
      if (!rule.enabled || rule.trigger_event !== eventType) continue
      try {
        const actions = JSON.parse(String(rule.actions)) as AutomationAction[]
        for (const action of actions) {
          await this._executeAction(action, data, String(rule.name))
        }
      } catch (err) {
        logger.error(`Automation rule '${rule.name}' failed`, err)
      }
    }
  }

  private async _executeAction(action: AutomationAction, _data: unknown, ruleName: string) {
    switch (action.type) {
      case 'run_skill': {
        if (!this.tools || !action.skill) break
        const ctx: ToolContext = { sessionId: `automation:${ruleName}`, agentId: 'general', channel: 'automation' }
        const result = await this.tools.execute(action.skill, action.args ?? {}, ctx)
        logger.info(`Automation '${ruleName}': ${action.skill} -> ${result.slice(0, 100)}`)
        break
      }
      default:
        logger.debug(`Automation action type '${action.type}' not yet implemented`)
    }
  }
}
