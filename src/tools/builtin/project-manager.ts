import type { Tool } from '../registry.js'
import type { Database } from '../../infra/db.js'

export class ProjectManagerTool implements Tool {
  readonly name = 'project_manager'
  readonly description = 'Verwaltet Projekte und Aufgaben: Erstellen, Bearbeiten, Auflisten und Abschliessen.'
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list_projects', 'create_project', 'update_project', 'delete_project', 'list_tasks', 'add_task', 'update_task', 'delete_task', 'complete_task'],
        description: 'Die auszufuehrende Aktion',
      },
      project_name: { type: 'string', description: 'Projektname' },
      project_id: { type: 'integer', description: 'Projekt-ID' },
      task_id: { type: 'integer', description: 'Aufgaben-ID' },
      title: { type: 'string', description: 'Titel der Aufgabe' },
      description: { type: 'string', description: 'Beschreibung' },
      status: { type: 'string', description: 'Status: pending, in_progress, done, cancelled' },
      priority: { type: 'integer', description: 'Prioritaet (0-10)' },
    },
    required: ['action'],
  }

  constructor(private readonly db: Database) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const action = String(args.action ?? '')

    switch (action) {
      case 'list_projects': {
        const projects = this.db.listProjectsWithTaskCounts()
        if (!projects.length) return 'Keine Projekte vorhanden.'
        return projects.map(p =>
          `[${p.id}] ${p.name} (${p.status}) - ${p.task_count} Aufgaben, ${p.done_count} erledigt`
        ).join('\n')
      }

      case 'create_project': {
        const name = String(args.project_name ?? '').trim()
        if (!name) return 'Fehler: Projektname erforderlich.'
        if (this.db.getProjectByName(name)) return `Projekt '${name}' existiert bereits.`
        const project = this.db.createProject(name, String(args.description ?? ''))
        return `Projekt erstellt: [${project.id}] ${project.name}`
      }

      case 'update_project': {
        const id = Number(args.project_id)
        if (!id) return 'Fehler: project_id erforderlich.'
        const project = this.db.getProjectById(id)
        if (!project) return `Projekt ${id} nicht gefunden.`
        const fields: Record<string, unknown> = {}
        if (args.status) fields.status = args.status
        if (args.description !== undefined) fields.description = args.description
        if (args.project_name) fields.name = args.project_name
        this.db.updateProject(id, fields)
        return `Projekt ${id} aktualisiert.`
      }

      case 'delete_project': {
        const id = Number(args.project_id)
        if (!id) return 'Fehler: project_id erforderlich.'
        if (!this.db.getProjectById(id)) return `Projekt ${id} nicht gefunden.`
        this.db.deleteProject(id)
        return `Projekt ${id} geloescht.`
      }

      case 'list_tasks': {
        const id = Number(args.project_id)
        if (!id) return 'Fehler: project_id erforderlich.'
        const tasks = this.db.listTasksByProject(id)
        if (!tasks.length) return 'Keine Aufgaben in diesem Projekt.'
        return tasks.map(t =>
          `[${t.id}] ${t.title} (${t.status}, Prioritaet: ${t.priority})`
        ).join('\n')
      }

      case 'add_task': {
        const projectId = Number(args.project_id)
        const title = String(args.title ?? '').trim()
        if (!projectId || !title) return 'Fehler: project_id und title erforderlich.'
        if (!this.db.getProjectById(projectId)) return `Projekt ${projectId} nicht gefunden.`
        const task = this.db.addTask(projectId, title, String(args.description ?? ''), Number(args.priority ?? 0))
        return `Aufgabe erstellt: [${task.id}] ${task.title}`
      }

      case 'update_task': {
        const id = Number(args.task_id)
        if (!id) return 'Fehler: task_id erforderlich.'
        const fields: Record<string, unknown> = {}
        if (args.status) fields.status = args.status
        if (args.title) fields.title = args.title
        if (args.description !== undefined) fields.description = args.description
        if (args.priority !== undefined) fields.priority = args.priority
        this.db.updateTask(id, fields)
        return `Aufgabe ${id} aktualisiert.`
      }

      case 'complete_task': {
        const id = Number(args.task_id)
        if (!id) return 'Fehler: task_id erforderlich.'
        this.db.updateTask(id, { status: 'done' })
        return `Aufgabe ${id} als erledigt markiert.`
      }

      case 'delete_task': {
        const id = Number(args.task_id)
        if (!id) return 'Fehler: task_id erforderlich.'
        this.db.deleteTask(id)
        return `Aufgabe ${id} geloescht.`
      }

      default:
        return `Unbekannte Aktion: ${action}`
    }
  }
}
