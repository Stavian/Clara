import type { WebSocket } from '@fastify/websocket'
import type { ChannelAdapter } from '../types.js'

export class WebSocketAdapter implements ChannelAdapter {
  constructor(private readonly ws: WebSocket) {}

  async sendToolCall(toolName: string, args: Record<string, unknown>) {
    this._send({ type: 'tool_call', tool: toolName, args })
  }

  async sendImage(src: string, alt: string) {
    this._send({ type: 'image', src, alt })
  }

  async sendStreamToken(token: string) {
    this._send({ type: 'stream', token })
  }

  async sendStreamEnd() {
    this._send({ type: 'stream_end' })
  }

  async sendMessage(content: string) {
    this._send({ type: 'message', content })
  }

  async sendError(content: string) {
    this._send({ type: 'error', content })
  }

  async sendAudio(src: string) {
    this._send({ type: 'audio', src })
  }

  private _send(data: unknown) {
    try {
      if (this.ws.readyState === this.ws.OPEN) {
        this.ws.send(JSON.stringify(data))
      }
    } catch { /* client disconnected */ }
  }
}
