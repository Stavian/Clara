import type { BindingConfigEntry } from '../config/types.js'

export interface ResolvedAgentRoute {
  agentId: string
  channel: string
  accountId: string
  peer: string
  sessionKey: string
  matchedBy: 'binding.peer' | 'binding.account' | 'binding.channel' | 'default'
}

/**
 * Session key format: <agentId>:<channel>:<accountId>:<peer>
 */
export function makeSessionKey(agentId: string, channel: string, accountId: string, peer: string): string {
  return `${agentId}:${channel}:${accountId}:${peer}`
}

export function resolveAgentRoute(
  channel: string,
  accountId: string,
  peer: string,
  bindings: BindingConfigEntry[],
  defaultAgentId: string,
): ResolvedAgentRoute {
  // Priority 1: peer binding (exact DM match)
  for (const b of bindings) {
    if (b.channel === channel && b.peer && b.peer === peer) {
      return _route(b.agentId, channel, accountId, peer, 'binding.peer')
    }
  }

  // Priority 2: account binding (all messages from this user)
  for (const b of bindings) {
    if (b.channel === channel && b.account && b.account === accountId) {
      return _route(b.agentId, channel, accountId, peer, 'binding.account')
    }
  }

  // Priority 3: channel binding (entire channel)
  for (const b of bindings) {
    if (b.channel === channel && !b.peer && !b.account) {
      return _route(b.agentId, channel, accountId, peer, 'binding.channel')
    }
  }

  // Default
  return _route(defaultAgentId, channel, accountId, peer, 'default')
}

function _route(
  agentId: string,
  channel: string,
  accountId: string,
  peer: string,
  matchedBy: ResolvedAgentRoute['matchedBy'],
): ResolvedAgentRoute {
  return {
    agentId,
    channel,
    accountId,
    peer,
    sessionKey: makeSessionKey(agentId, channel, accountId, peer),
    matchedBy,
  }
}
