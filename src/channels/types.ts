export interface ChannelMessage {
  sessionKey: string
  userId: string
  peer: string
  content: string
  imageBase64?: string
  ttsEnabled?: boolean
  agentOverride?: string
}

export interface ChannelAdapter {
  sendToolCall(toolName: string, args: Record<string, unknown>): Promise<void>
  sendImage(src: string, alt: string): Promise<void>
  sendStreamToken(token: string): Promise<void>
  sendStreamEnd(): Promise<void>
  sendMessage(content: string): Promise<void>
  sendError(content: string): Promise<void>
  sendAudio(src: string): Promise<void>
}

export interface Channel {
  readonly name: string
  start(): Promise<void>
  stop(): Promise<void>
  onMessage(handler: (msg: ChannelMessage) => Promise<void>): void
  send(sessionKey: string, content: string): Promise<void>
  readonly capabilities: {
    streaming: boolean
    reactions: boolean
    groupChat: boolean
    threads: boolean
  }
}
