import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { createLogger } from '../infra/logger.js'

const logger = createLogger('auth')

export type AuthMode = 'none' | 'token' | 'password'

export interface AuthConfig {
  mode: AuthMode
  password?: string
  jwtSecret?: string
}

export class AuthService {
  private readonly mode: AuthMode
  private readonly passwordHash: string | null
  private readonly jwtSecret: string

  constructor(cfg: AuthConfig) {
    this.mode = cfg.mode ?? 'none'

    if (cfg.password) {
      this.passwordHash = bcrypt.hashSync(cfg.password, 10)
    } else {
      this.passwordHash = null
    }

    if (cfg.jwtSecret) {
      this.jwtSecret = cfg.jwtSecret
    } else {
      this.jwtSecret = randomBytes(32).toString('hex')
      logger.warn('JWT_SECRET not set — using ephemeral secret, all tokens will be invalidated on restart')
    }
  }

  isEnabled(): boolean {
    return this.mode !== 'none'
  }

  verifyPassword(plain: string): boolean {
    if (!this.passwordHash) return false
    return bcrypt.compareSync(plain, this.passwordHash)
  }

  createToken(): string {
    return jwt.sign({}, this.jwtSecret, { expiresIn: '30d' })
  }

  verifyToken(token: string | null | undefined): boolean {
    if (!token) return false
    try {
      jwt.verify(token, this.jwtSecret)
      return true
    } catch { return false }
  }
}
