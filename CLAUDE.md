# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm install
npm run dev:gw                            # Start gateway: http://127.0.0.1:8080
node_modules/.bin/tsx src/entry.ts gateway run   # Equivalent
node_modules/.bin/tsc --noEmit           # Type check only
npm run lint                             # oxlint src/
npm test                                 # vitest run
```

### CLI commands
```bash
npx tsx src/entry.ts agent list
npx tsx src/entry.ts config get
npx tsx src/entry.ts memory search "..."
npx tsx src/entry.ts gateway run
```

### Config & env
- Config file: `~/.clara/config.json5` (JSON5 + TypeBox schema)
- Key env vars: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `PORT`, `HOST`, `WEB_PASSWORD`, `JWT_SECRET`
- Env vars override config file values

## Architecture

Clara is a locally-hosted AI assistant (TypeScript v2, "OpenClaw architecture"). The gateway runs on Fastify with a WebSocket chat endpoint; all LLM interaction goes through a stateless tool-loop function.

### Startup & DI

`src/entry.ts` → Commander.js → `src/cli/run-main.ts` registers commands → `src/cli/deps.ts` `createDefaultDeps()` constructs and wires all services in one place:

```
Config → Database → LLM → EmbeddingClient → Memory
      ↘ EventBus → Tools → Scheduler → AutomationEngine
      ↘ AgentRouter
      ↘ → startGateway(deps)
```

There is no IoC container — all wiring is explicit in `createDefaultDeps()`.

### Core request flow

```
WebSocket message
  → gateway/server.ts  (auth, parse, load image)
  → gateway/call.ts    handleAgentCall()
      → build messages (system prompt + memory context + history)
      → LLM tool loop (max agentScope.maxRounds rounds)
          → parallel tool calls via Promise.allSettled()
          → sequential agent delegations via AgentRouter
      → stream or send final response
      → fire-and-forget: extractFacts(), TTS
```

### Key modules

| Path | Role |
|------|------|
| `src/gateway/call.ts` | `handleAgentCall()` — the entire LLM tool loop |
| `src/gateway/server.ts` | Fastify setup, all HTTP + WebSocket routes |
| `src/llm/client.ts` | `LLMClient` interface, `stripThink()`, `parseModelRef()` |
| `src/llm/factory.ts` | Creates correct client from `provider/model` string |
| `src/agents/agent-scope.ts` | `resolveAgentScope()` — YAML + config merge |
| `src/agents/router.ts` | `AgentRouter` — sub-agent delegation |
| `src/tools/registry.ts` | `ToolRegistry` — register, list, execute tools |
| `src/memory/manager.ts` | `MemoryManager` — sqlite-vec vector + FTS5 keyword search |
| `src/channels/types.ts` | `ChannelAdapter` interface |
| `src/infra/db.ts` | `Database` wrapper (better-sqlite3, WAL mode) |
| `src/automation/event-bus.ts` | In-process pub/sub `EventBus` |

### Agent scope resolution

`resolveAgentScope(agentId, cfg)` merges three layers (later overrides earlier):
1. Defaults (from `cfg.agentDefaults`)
2. YAML template — `data/agent_templates/custom/<id>.yaml` overrides `_builtin/<id>.yaml`
3. JSON5 config entry (`cfg.agentList`)

Result: `AgentScope` with `systemPrompt`, `skills` (null = all), `model`, `maxRounds`, `contextWindow`.

### LLM model refs

Format: `provider/model` — e.g. `ollama/qwen3:14b`, `openai/gpt-4o`, `anthropic/claude-opus-4-6`.
If no `/` is present, provider defaults to `ollama`. Parsed by `parseModelRef()` in `src/llm/client.ts`.

### Tool system

Tools implement `{ name, description, parameters, execute(args, ctx) }`. Registered in `createDefaultDeps()`. The registry generates OpenAI function-calling definitions from the schema. `allowedSkills: null` means all tools are permitted; an array restricts to named tools.

Builtin tools (14): `web_browse`, `web_fetch`, `file_manager`, `system_command`, `memory_manager`, `calculator`, `project_manager`, `task_scheduler`, `screenshot`, `clipboard`, `image_generation`, `webhook_manager`, `automation_manager`, `batch_script`.

## Critical Patterns

### Think-block stripping
`stripThink()` in `src/llm/client.ts` — single source of truth. Strips `<think>...</think>`, `<tool_call>...</tool_call>`, handles unclosed tags, and drops lines containing only non-Latin characters (CJK filler from Qwen models). Every response path must call this before sending to the client.

### Image deduplication
When a tool result contains `![alt](/generated/...)`, `_executeTool()` in `gateway/call.ts` sends a separate WebSocket `image` event and replaces the markdown with `[Bild wurde angezeigt]`. This prevents the LLM from echoing the URL in its summary.

### Streaming flow
After all tool rounds complete, if `response.content` is empty, the LLM is asked to summarize tool results. The response is streamed token-by-token, buffering until `</think>` is seen before forwarding tokens to the client.

### Fire-and-forget tasks
Fact extraction and TTS are launched with `_fireAndForget()` — they do not block the response and failures are logged at debug level only.

### WebSocket protocol (client → server)
```json
{ "message": "...", "tts": false, "image": "/uploads/uuid.png", "agent": "coding" }
```
Server event types sent to client: `message`, `stream`, `stream_end`, `tool_call`, `image`, `audio`, `error`.

## Conventions

- All assistant responses must be in German (default system prompt in `agent-scope.ts` enforces this)
- Image generation prompts must be in English; SD Forge adds European ethnicity hints by default
- System prompts use ASCII-safe German (`ae`/`oe`/`ue` instead of umlauts) — they live in TS strings
- `data/` is git-ignored (DB, generated images, logs, scripts, agent templates runtime data)
- `deploy/` contains Proxmox/Ubuntu systemd service, `install.sh`, `update.sh`, `backup.sh`
- Deploy scripts run as root: `sudo bash /opt/clara/deploy/update.sh`

## Production Deployment

Clara runs on a Proxmox VM (Ubuntu 22.04) at `/opt/clara` as the `clara` system user, managed by systemd.

```bash
sudo bash /opt/clara/deploy/install.sh   # First-time install
/opt/clara/deploy/update.sh              # Deploy after git push
ssh root@<VM_IP> '/opt/clara/deploy/update.sh'
journalctl -u clara -f
```

## Python Legacy

The original Python implementation (`main.py`, `chat/`, `skills/`, etc.) is kept for reference only. The active codebase is TypeScript under `src/`. Do not add features to the Python code.

---

## Roadmap

### Phasen-Ubersicht

| Phase | Bereich | Prioritat | Status |
|-------|---------|-----------|--------|
| 9 | Erweiterte Memory-Systeme | Sofort nutzlich | Teilweise |
| 10 | Multi-Channel Messaging | Sofort nutzlich | Teilweise |
| 11 | Automatisierung & Skripte | Produktivitat | Fertig |
| 12 | Erweiterte Skills & Tools | Produktivitat | Teilweise |
| 13 | Agent-System | Power-Feature | Fertig |
| 14 | Erweiterte UI | Power-Feature | Teilweise |
| 15 | Sicherheit & Stabilitat | Qualitat | Teilweise (Auth+RateLimit fertig) |
| 16 | Voice & Multimedia | Qualitat | Teilweise |
| 17 | Externe Integrationen | Nice-to-have | Offen |
| 18 | Multi-Provider LLM | Produktivitat | Offen |
| 19 | Gateway & API-Server | Power-Feature | Offen |
| 20 | Browser-Automatisierung | Produktivitat | Offen |
| 21 | Session-Management | Power-Feature | Offen |
| 22 | Node & Device-Steuerung | Nice-to-have | Offen |
| 23 | CLI & Diagnostik | Qualitat | Offen |
| 24 | Canvas & Dynamic UI | Nice-to-have | Offen |
| 25 | Claude Code Integration | Power-Feature | Offen |
| 26 | Kontext-Management & Kompaktierung | Power-Feature | Offen |
| 27 | Workspace & Bootstrap-System | Power-Feature | Offen |
| 28 | Streaming-Optimierung | Qualitat | Offen |
| 29 | OAuth & Multi-Account-Auth | Produktivitat | Offen |
| 30 | Plugin & Hook-System | Nice-to-have | Offen |

---

### Phase 9 - Erweiterte Memory-Systeme

- [x] Automatische Extraktion von Fakten uber den Nutzer (memory/manager.ts extractFacts)
- [x] Memory-Management Tool (tools/builtin/memory-manager.ts)
- [ ] Vektor-basierte semantische Memory-Suche (sqlite-vec installiert, noch nicht aktiviert)
- [ ] Hybrid-Suche: Vektor-Semantik + FTS5 Keyword
- [ ] Memory-Export/Import (JSON/Markdown)
- [ ] Temporal Decay: Neuere Erinnerungen hoeher gewichten
- [ ] Embedding-Cache

---

### Phase 10 - Multi-Channel Messaging

- [ ] Telegram-Integration
- [x] Discord-Struktur vorbereitet (ChannelAdapter-Interface)
- [ ] Discord-Bot wiederverbinden (war im Python-Stack)
- [ ] Cross-Channel Messaging

---

### Phase 11 - Automatisierung & Skripte

- [x] Cron-Jobs (SchedulerEngine + TaskSchedulerTool)
- [x] Webhook-Empfanger (/api/webhooks/:name)
- [x] Automatische Aktionen basierend auf Ereignissen (AutomationEngine + EventBus)
- [x] Batch-Skript-Ausfuhrung (BatchScriptTool)
- [ ] System-Events: Heartbeat-Trigger, Startup/Shutdown, Error-Events
- [ ] Event-Hooks: Benutzerdefinierte Aktionen bei Tool-Aufrufen

---

### Phase 12 - Erweiterte Skills & Tools

- [x] Screenshot, Clipboard, Calculator, WebBrowse, WebFetch, FileManager, SystemCommand
- [x] ProjectManager, TaskScheduler, MemoryManager, WebhookManager, AutomationManager, BatchScript
- [ ] ImageGeneration (nur aktiv wenn `SD_ENABLED=true`)
- [ ] E-Mail-Integration (IMAP/SMTP)
- [ ] Bild-Analyse mit Vision-Modell
- [ ] Prozess-Manager

---

### Phase 13 - Agent-System

- [x] AgentScope-Aufloesung (YAML + config merge)
- [x] AgentRouter mit delegate_to_agent Tool
- [ ] Per-Agent Tool-Profile
- [ ] Workspace & Bootstrap-Dateien pro Agent (IDENTITY.md, SOUL.md, TOOLS.md)
- [ ] Spezifizitaets-basiertes Agenten-Routing

---

### Phase 14 - Erweiterte UI

- [x] Bestehendes Web-UI aus Python-Stack (web/static/) unveraendert weitergenutzt
- [ ] Slash-Commands (/help, /clear, /model, /agent)
- [ ] Code-Highlighting
- [ ] Session-Browser

---

### Phase 15 - Sicherheit & Stabilitat

- [x] JWT + bcrypt Auth (AuthService)
- [x] Health-Check (/health public, /api/health protected)
- [ ] Audit-Log
- [ ] Hot-Reload: Konfigurationsaenderungen ohne Neustart
- [ ] Clara Doctor: Selbstdiagnose

---

### Phase 16 - Voice & Multimedia

- [ ] TTS (stub in call.ts _sendTTS vorhanden, edge-tts noch nicht eingebaut)
- [ ] STT (Whisper)
- [ ] Bild-Upload zur Analyse (Upload-Endpunkt und base64-Uebergabe vorhanden)

---

### Phase 18 - Multi-Provider LLM

- [x] LLMClient-Interface + Factory (parseModelRef, createLLMClient)
- [x] Ollama, OpenAI, Anthropic Implementierungen vorhanden
- [ ] Per-Agent Model-Override vollstaendig verdrahtet
- [ ] Model-Fallback-Ketten

---

### Phase 19 - Gateway & API-Server

- [ ] OpenAI-kompatibler API-Endpunkt
- [ ] Health-Metriken-API (CPU, RAM, GPU)
- [ ] Event-Streaming fuer externe Clients

---

### Phase 20 - Browser-Automatisierung

- [ ] Playwright-Integration als Browser-Tool

---

### Phase 23 - CLI & Diagnostik

- [ ] `clara status` / `clara doctor` / `clara logs` / `clara models list`

---

### Phase 25 - Claude Code Integration

- [ ] CodingTool: Clara delegiert Coding-Auftraege an Claude Code subprocess

---

### Empfehlungen fur die Umsetzung

**Prioritaeten:**
1. **Phase 18** — Multi-Provider vollstaendig verdrahten (Factory + per-Agent model override)
2. **Phase 9** — sqlite-vec Vektor-Suche aktivieren (Infrastruktur bereits installiert)
3. **Phase 20** — Browser-Automatisierung (Playwright)
4. **Phase 10** — Discord-Bot im TS-Stack neu implementieren
5. **Phase 23** — CLI-Diagnose-Befehle
