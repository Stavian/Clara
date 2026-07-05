import { createWriteStream, mkdirSync } from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, critical: 4 }

let _minLevel = LEVELS.info
let _fileStream: ReturnType<typeof createWriteStream> | null = null

export function setLogLevel(level: LogLevel) {
  _minLevel = LEVELS[level]
}

export function initFileLogging(logDir: string) {
  mkdirSync(logDir, { recursive: true })
  const logPath = path.join(logDir, 'clara.log')
  _fileStream = createWriteStream(logPath, { flags: 'a' })
}

function write(level: LogLevel, name: string, msg: string, err?: unknown) {
  if (LEVELS[level] < _minLevel) return
  const ts = new Date().toISOString()
  const errStr = err
    ? ` ${err instanceof Error ? err.stack ?? err.message : String(err)}`
    : ''
  const line = `${ts} [${level.toUpperCase()}] ${name}: ${msg}${errStr}`
  console.log(line)
  _fileStream?.write(line + '\n')
}

export type Logger = ReturnType<typeof createLogger>

export function createLogger(name: string) {
  return {
    debug: (msg: string, err?: unknown) => write('debug', name, msg, err),
    info: (msg: string, err?: unknown) => write('info', name, msg, err),
    warn: (msg: string, err?: unknown) => write('warn', name, msg, err),
    error: (msg: string, err?: unknown) => write('error', name, msg, err),
    critical: (msg: string, err?: unknown) => write('critical', name, msg, err),
  }
}
