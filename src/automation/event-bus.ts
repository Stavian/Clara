import { EventEmitter } from 'node:events'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('event-bus')

export interface BusEvent {
  type: string
  source: string
  timestamp: string
  data: unknown
}

export class EventBus {
  private readonly emitter = new EventEmitter()
  private readonly _history: BusEvent[] = []
  private readonly _maxHistory = 100

  emit(eventType: string, data: unknown = {}, source = 'system') {
    const event: BusEvent = {
      type: eventType,
      source,
      timestamp: new Date().toISOString(),
      data,
    }
    this._history.unshift(event)
    if (this._history.length > this._maxHistory) this._history.pop()
    logger.debug(`Event: ${eventType} from ${source}`)
    this.emitter.emit(eventType, event)
    this.emitter.emit('*', event)
  }

  on(eventType: string, handler: (event: BusEvent) => void) {
    this.emitter.on(eventType, handler)
  }

  off(eventType: string, handler: (event: BusEvent) => void) {
    this.emitter.off(eventType, handler)
  }

  onAny(handler: (event: BusEvent) => void) {
    this.emitter.on('*', handler)
  }

  getRecentEvents(limit = 15): BusEvent[] {
    return this._history.slice(0, limit)
  }
}
