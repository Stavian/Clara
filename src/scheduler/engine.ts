import cron from 'node-cron'
import type { Database } from '../infra/db.js'
import type { ToolRegistry, ToolContext } from '../tools/registry.js'
import type { EventBus } from '../automation/event-bus.js'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('scheduler')

export interface JobEntry {
  name: string
  cronExpr: string
  skillName: string
  skillArgs: Record<string, unknown>
  enabled: boolean
  lastRun?: string
}

export class SchedulerEngine {
  private readonly tasks: Map<string, cron.ScheduledTask> = new Map()
  private tools: ToolRegistry | null = null

  constructor(
    private readonly db: Database,
    private readonly eventBus: EventBus,
  ) {}

  setToolRegistry(tools: ToolRegistry) {
    this.tools = tools
  }

  start() {
    // Load existing jobs from DB
    const jobs = this.db.listJobs()
    for (const job of jobs) {
      if (job.enabled) {
        this._scheduleJob(
          String(job.name),
          String(job.cron_expr),
          String(job.skill_name),
          JSON.parse(String(job.skill_args)) as Record<string, unknown>,
        )
      }
    }

    // Heartbeat every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      this.eventBus.emit('heartbeat', { timestamp: new Date().toISOString() }, 'scheduler')
    })

    logger.info(`Scheduler started with ${jobs.length} jobs`)
  }

  stop() {
    for (const task of this.tasks.values()) task.stop()
    this.tasks.clear()
  }

  listJobs(): JobEntry[] {
    return this.db.listJobs().map(j => ({
      name: String(j.name),
      cronExpr: String(j.cron_expr),
      skillName: String(j.skill_name),
      skillArgs: JSON.parse(String(j.skill_args)) as Record<string, unknown>,
      enabled: Boolean(j.enabled),
      lastRun: j.last_run ? String(j.last_run) : undefined,
    }))
  }

  addJob(name: string, cronExpr: string, skillName: string, skillArgs: Record<string, unknown>) {
    if (!cron.validate(cronExpr)) throw new Error(`Ungueltige Cron-Expression: ${cronExpr}`)
    this.db.upsertJob(name, cronExpr, skillName, skillArgs)
    this._unschedule(name)
    this._scheduleJob(name, cronExpr, skillName, skillArgs)
    logger.info(`Job '${name}' added: ${cronExpr} -> ${skillName}`)
  }

  removeJob(name: string) {
    this._unschedule(name)
    this.db.deleteJob(name)
    logger.info(`Job '${name}' removed`)
  }

  setJobEnabled(name: string, enabled: boolean) {
    this.db.raw.prepare('UPDATE scheduled_jobs SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name)
    if (enabled) {
      const job = this.db.raw.prepare('SELECT * FROM scheduled_jobs WHERE name = ?').get(name) as {
        cron_expr: string; skill_name: string; skill_args: string
      } | undefined
      if (job) {
        this._scheduleJob(
          name,
          job.cron_expr,
          job.skill_name,
          JSON.parse(job.skill_args) as Record<string, unknown>,
        )
      }
    } else {
      this._unschedule(name)
    }
  }

  private _scheduleJob(name: string, cronExpr: string, skillName: string, skillArgs: Record<string, unknown>) {
    if (!cron.validate(cronExpr)) {
      logger.warn(`Invalid cron expression for job '${name}': ${cronExpr}`)
      return
    }
    const task = cron.schedule(cronExpr, async () => {
      logger.info(`Running scheduled job '${name}': ${skillName}`)
      if (this.tools) {
        const ctx: ToolContext = { sessionId: `scheduler:${name}`, agentId: 'general', channel: 'scheduler' }
        const result = await this.tools.execute(skillName, skillArgs, ctx)
        logger.info(`Job '${name}' result: ${result.slice(0, 100)}`)
        this.eventBus.emit('job.completed', { name, skillName, result }, 'scheduler')
      }
      this.db.updateJobLastRun(name)
    })
    this.tasks.set(name, task)
  }

  private _unschedule(name: string) {
    const existing = this.tasks.get(name)
    if (existing) {
      existing.stop()
      this.tasks.delete(name)
    }
  }
}
