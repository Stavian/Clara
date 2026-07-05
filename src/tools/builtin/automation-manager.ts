import type { Tool } from '../registry.js'
import type { Database } from '../../infra/db.js'
import type { EventBus } from '../../automation/event-bus.js'

export class AutomationManagerTool implements Tool {
  readonly name = 'automation_manager'
  readonly description = 'Verwaltet Automatisierungsregeln: Trigger-basierte Aktionen erstellen und verwalten.'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'delete', 'trigger'],
        description: 'Die auszufuehrende Aktion',
      },
      name: { type: 'string', description: 'Name der Regel' },
      trigger_event: { type: 'string', description: 'Ereignis das die Regel ausloest' },
      actions: {
        type: 'array',
        description: 'Liste von Aktionen: [{type: "run_skill", skill: "...", args: {...}}]',
      },
      event: { type: 'string', description: 'Event-Name zum manuellen Ausloesen' },
      data: { type: 'object', description: 'Event-Daten' },
    },
    required: ['action'],
  }

  constructor(
    private readonly db: Database,
    private readonly eventBus: EventBus,
  ) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '')

    switch (action) {
      case 'list': {
        const rules = this.db.listAutomationRules()
        if (!rules.length) return 'Keine Automatisierungsregeln konfiguriert.'
        return rules.map(r => `[${r.name}] Trigger: ${r.trigger_event} (${r.enabled ? 'aktiv' : 'deaktiviert'})`).join('\n')
      }

      case 'create': {
        const name = String(args.name ?? '').trim()
        const triggerEvent = String(args.trigger_event ?? '').trim()
        const actions = (args.actions ?? []) as unknown[]
        if (!name || !triggerEvent) return 'Fehler: name und trigger_event erforderlich.'
        this.db.upsertAutomationRule(name, triggerEvent, actions)
        return `Regel '${name}' erstellt. Wird bei '${triggerEvent}' ausgeloest.`
      }

      case 'delete': {
        const name = String(args.name ?? '').trim()
        if (!name) return 'Fehler: name erforderlich.'
        this.db.deleteAutomationRule(name)
        return `Regel '${name}' geloescht.`
      }

      case 'trigger': {
        const event = String(args.event ?? '').trim()
        if (!event) return 'Fehler: event erforderlich.'
        this.eventBus.emit(event, args.data ?? {})
        return `Event '${event}' ausgeloest.`
      }

      default:
        return `Unbekannte Aktion: ${action}`
    }
  }
}
