import type { Tool } from '../registry.js'
import type { SchedulerEngine } from '../../scheduler/engine.js'

export class TaskSchedulerTool implements Tool {
  readonly name = 'task_scheduler'
  readonly description = 'Plant wiederkehrende Aufgaben und Cron-Jobs.'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'add', 'remove', 'enable', 'disable'],
        description: 'Die auszufuehrende Aktion',
      },
      name: { type: 'string', description: 'Name des Jobs' },
      cron: { type: 'string', description: 'Cron-Ausdruck (z.B. "0 9 * * *" = taeglich 9 Uhr)' },
      skill: { type: 'string', description: 'Auszufuehrender Skill-Name' },
      args: { type: 'object', description: 'Argumente fuer den Skill' },
    },
    required: ['action'],
  }

  constructor(private readonly scheduler: SchedulerEngine) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '')

    switch (action) {
      case 'list': {
        const jobs = this.scheduler.listJobs()
        if (!jobs.length) return 'Keine geplanten Jobs.'
        return jobs.map(j => `[${j.name}] ${j.cronExpr} -> ${j.skillName} (${j.enabled ? 'aktiv' : 'deaktiviert'})`).join('\n')
      }

      case 'add': {
        const name = String(args.name ?? '').trim()
        const cron = String(args.cron ?? '').trim()
        const skill = String(args.skill ?? '').trim()
        if (!name || !cron || !skill) return 'Fehler: name, cron und skill erforderlich.'
        const skillArgs = (args.args ?? {}) as Record<string, unknown>
        this.scheduler.addJob(name, cron, skill, skillArgs)
        return `Job '${name}' hinzugefuegt: ${cron} -> ${skill}`
      }

      case 'remove': {
        const name = String(args.name ?? '').trim()
        if (!name) return 'Fehler: name erforderlich.'
        this.scheduler.removeJob(name)
        return `Job '${name}' entfernt.`
      }

      case 'enable':
      case 'disable': {
        const name = String(args.name ?? '').trim()
        if (!name) return 'Fehler: name erforderlich.'
        this.scheduler.setJobEnabled(name, action === 'enable')
        return `Job '${name}' ${action === 'enable' ? 'aktiviert' : 'deaktiviert'}.`
      }

      default:
        return `Unbekannte Aktion: ${action}`
    }
  }
}
