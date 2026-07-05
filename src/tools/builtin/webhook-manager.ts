import type { Tool } from '../registry.js'
import type { Database } from '../../infra/db.js'

export class WebhookManagerTool implements Tool {
  readonly name = 'webhook_manager'
  readonly description = 'Verwaltet eingehende Webhooks: Erstellen, Auflisten und Loeschen.'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'delete'],
        description: 'Die auszufuehrende Aktion',
      },
      name: { type: 'string', description: 'Name des Webhooks' },
      event_type: { type: 'string', description: 'Event-Typ der ausgeloest wird' },
      secret: { type: 'string', description: 'Geheimnis fuer Webhook-Validierung (optional)' },
    },
    required: ['action'],
  }

  constructor(private readonly db: Database) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '')

    switch (action) {
      case 'list': {
        const hooks = this.db.listWebhooks()
        if (!hooks.length) return 'Keine Webhooks konfiguriert.'
        return hooks.map(h => `[${h.name}] Event: ${h.event_type} | URL: /api/webhooks/${h.name}`).join('\n')
      }

      case 'create': {
        const name = String(args.name ?? '').trim()
        const eventType = String(args.event_type ?? 'webhook').trim()
        if (!name) return 'Fehler: name erforderlich.'
        this.db.upsertWebhook(name, args.secret ? String(args.secret) : null, eventType)
        return `Webhook '${name}' erstellt. Aufrufen unter: POST /api/webhooks/${name}`
      }

      case 'delete': {
        const name = String(args.name ?? '').trim()
        if (!name) return 'Fehler: name erforderlich.'
        this.db.deleteWebhook(name)
        return `Webhook '${name}' geloescht.`
      }

      default:
        return `Unbekannte Aktion: ${action}`
    }
  }
}
