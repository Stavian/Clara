# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

```bash
pip install -r requirements.txt
python main.py  # Starts on http://127.0.0.1:8080
```

Requires Ollama running at `http://localhost:11434`. Stable Diffusion Forge is optional — set `SD_ENABLED=true` in `.env` to activate it. No test suite — verify changes by running the app.

### Key env vars (copy `.env.example` → `.env`)

| Var | Default | Notes |
|-----|---------|-------|
| `HOST` | `0.0.0.0` | Set `127.0.0.1` to restrict to localhost |
| `OLLAMA_MODEL` | `huihui_ai/qwen3-abliterated:14b` | Main chat model |
| `WEB_PASSWORD` | *(unset = auth disabled)* | bcrypt-hashed at startup |
| `JWT_SECRET` | *(ephemeral if unset)* | Must be set for persistent sessions |
| `SD_ENABLED` | `false` | Set `true` to enable image generation via SD Forge |
| `GENERATED_IMAGES_DIR` | `data/generated_images` | Can point to HDD |
| `GENERATED_AUDIO_DIR` | `data/generated_audio` | Can point to HDD |
| `LOG_DIR` | `data/logs` | Can point to HDD |
| `DB_PATH` | `data/clara.db` | Keep on SSD |

## Production Deployment

Clara runs on a Proxmox VM (Ubuntu 22.04) at `/opt/clara` as the `clara` system user, managed by systemd.

```bash
# First-time install on a fresh Ubuntu VM
sudo bash /opt/clara/deploy/install.sh

# Deploy after git push from dev PC
/opt/clara/deploy/update.sh
# or remotely:
ssh root@<VM_IP> '/opt/clara/deploy/update.sh'

# Logs
journalctl -u clara -f
```

## Architecture

Clara is a locally-hosted AI assistant with a web UI and Discord bot. Everything runs async on FastAPI + WebSocket + discord.py.

**Core flow:** User message → Channel (WebSocket / Discord) → `ChatEngine` → LLM tool loop (max 5 rounds) → parallel tool execution → response back via `ChannelAdapter`.

### Key Components

- **`main.py`** — FastAPI app entry point, skill registration, lifespan management, Discord bot startup, rotating file logging setup
- **`chat/engine.py`** — Channel-agnostic `ChatEngine`: LLM tool loop, streaming, DB save, fact extraction, TTS. Single source of truth for `_strip_think()`
- **`chat/adapters.py`** — `ChannelAdapter` ABC + `WebSocketAdapter`
- **`discord_bot/adapter.py`** — `DiscordAdapter`: implements `ChannelAdapter` for Discord; buffers stream tokens, splits messages at 2000 chars, sends images/audio as file attachments
- **`web/routes.py`** — WebSocket handler, system prompt (`SYSTEM_PROMPT`), HTTP routes, auth dependency `_require_auth`. Public `/health` endpoint (no auth). Protected `/api/health`
- **`config.py`** — All config via env vars. Paths (`LOG_DIR`, `GENERATED_IMAGES_DIR`, etc.) are env-overridable for HDD routing. JWT secret generated ephemerally if not set (logs a warning)
- **`discord_bot/bot.py`** — `ClaraDiscordBot`: @mentions in servers, all DMs. Owner ID gates full skill access
- **`llm/ollama_client.py`** — Ollama API wrapper; persistent `aiohttp.ClientSession` shared across all calls
- **`agents/agent_router.py`** — Specialist agent delegation; imports `_strip_think` from `chat.engine`
- **`agents/template_loader.py`** — `AgentTemplate` dataclass + `TemplateLoader` for YAML configs in `data/agent_templates/`
- **`auth/security.py`** — JWT creation/verification, bcrypt password check, `auth_enabled()` helper
- **`memory/database.py`** — aiosqlite wrapper. WAL mode + NORMAL sync enabled at init. Tables: `conversations`, `memory`, `projects`, `tasks`
- **`memory/project_store.py`** — `ProjectStore`: CRUD for projects and tasks (used by `project_manager` skill); exposes task-count aggregation queries for the UI
- **`services/tts_service.py`** — `generate_tts()`: strips markdown/code/URLs before synthesising speech via edge-tts; returns MP3 filename or None

### Skill System

Skills inherit from `BaseSkill` (`name`, `description`, `parameters`, `execute`). Registered in `SkillRegistry` at startup in `main.py`. Tool definitions are auto-generated in OpenAI function-calling format.

Current skills: `file_manager`, `system_command`, `web_browse`, `web_fetch`, `project_manager`, `task_scheduler`, `image_generation`, `memory_manager`, `webhook_manager`, `automation_manager`, `batch_script`, `screenshot`, `clipboard`, `pdf_reader`, `calculator`, `calendar_manager`

### Multi-Agent System

Agents are YAML templates in `data/agent_templates/` (`_builtin/` for builtins, `custom/` for user overrides — same name wins). Built-in agents: `general`, `coding`, `research`, `image_prompt`. The main model gets a `delegate_to_agent` tool; specialists cannot delegate further. Non-owner Discord users can only delegate to agents whose skill sets are entirely within `DISCORD_PUBLIC_SKILLS`.

### Phase 11 Subsystems (automation, webhooks, scripts)

These three subsystems are wired together in `main.py` lifespan and share `EventBus`:

- **`automation/automation_engine.py`** — Trigger-based automation rules stored in DB; executes skill chains when events fire on `EventBus`
- **`automation/event_bus.py`** — In-process pub/sub; skills and the scheduler publish events, automation engine subscribes
- **`webhook/manager.py`** + **`webhook/routes.py`** — Inbound webhooks stored in DB; fire events onto `EventBus` when called
- **`scripts/script_engine.py`** — Executes named multi-step skill scripts stored in `data/scripts/`
- **`notifications/notification_service.py`** — Sends notifications via Discord DM or WebSocket push; wired to `ChatEngine` and `DiscordBot`
- **`scheduler/engine.py`** — APScheduler-based task runner; executes overdue tasks and skill calls on schedule
- **`scheduler/heartbeat.py`** — Fires every `HEARTBEAT_INTERVAL_MINUTES`; checks overdue tasks and publishes heartbeat event

### Frontend

Vanilla HTML/CSS/JS in `web/static/`. WebSocket event types sent from server:
- `message` — complete assistant response
- `stream` / `stream_end` — token-by-token streaming
- `tool_call` — triggers activity cards (spinners, icons, German labels via `TOOL_META` / `_AGENT_META` in `app.js`)
- `image` — inline image display
- `audio` — TTS playback
- `error` — error display

## Conventions

- All assistant responses must be in German (system prompt enforces this)
- Image generation prompts must be in English
- Image generation adds European ethnicity hints to prompts and negative prompts by default
- System prompts use ASCII-safe German (ae/oe/ue instead of umlauts) — they live in Python strings
- `data/` is git-ignored (DB, generated images, logs, scripts, agent templates runtime data)
- `deploy/` contains production deployment files for Proxmox/Ubuntu — `clara.service`, `backup.sh`, `install.sh`, `update.sh`
- `CLAUDE.md` tracks project status and upcoming phases — consult before starting new features
- Deploy scripts must be run as root: `sudo bash /opt/clara/deploy/update.sh` (not as `marlon` user)

## Critical Patterns

### Think-block stripping
Qwen models emit `<think>...</think>` blocks and CJK filler lines. Single source of truth: `_strip_think()` in `chat/engine.py` (imported by `agent_router.py`). Any new response path must call it before sending to the frontend.
1. Strips `<think>...</think>` via regex
2. Removes unclosed `<think>` tags
3. Drops lines containing only non-Latin characters

### Image deduplication
When a tool returns `![alt](/generated/...)`, the image is sent as a separate `image` WebSocket event and the markdown is replaced with `[Bild wurde angezeigt]` in the tool result. Prevents the LLM from repeating the image URL in its summary. Implemented in `ChatEngine._execute_tool()` and `agent_router.py`.

### Streaming with think-block buffering
`ChatEngine` buffers tokens until `</think>` is seen, then streams cleaned text. Discord adapter buffers all stream tokens and sends a single message on `stream_end`.

### Async I/O
All blocking operations use `run_in_executor()`. `OllamaClient` and `ImageGenerationSkill` hold persistent `aiohttp` sessions — never create per-request sessions. Multiple tool calls in one LLM round run via `asyncio.gather()`. TTS and fact extraction are fire-and-forget `asyncio.create_task()`.

### Discord permission system
- `DISCORD_OWNER_ID` gets `allowed_skills=None` (full access)
- Other users get `Config.DISCORD_PUBLIC_SKILLS` only (`web_browse`, `web_fetch`, `image_generation`)
- Tool execution validates `allowed_skills` even if the LLM hallucinates a blocked tool call
- Session IDs: `discord-channel-{id}` for servers, `discord-dm-{id}` for DMs

### Memory system
- **`memory/context_builder.py`** — Injects recent memories into system prompt before each LLM call
- **`memory/fact_extractor.py`** — Fire-and-forget background task; LLM extracts user facts and stores via `db.remember()`
- **`skills/memory_manager.py`** — Explicit memory CRUD skill
- Categories: `vorlieben`, `persoenlich`, `technik`, `ziele`, `projekte`, `gewohnheiten`, `wichtig`

### Logging
`_setup_logging()` in `main.py` runs at import time (before other project imports). Writes to both console and a rotating file at `Config.LOG_DIR / "clara.log"` (10 MB × 7 files). Unhandled exceptions are caught by `sys.excepthook` and written to the log as CRITICAL.

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

**Prioritat:** Sofort nutzlich

- [x] Automatische Extraktion von Fakten uber den Nutzer (memory/fact_extractor.py)
- [x] Session-Zusammenfassung und Kontext-Priorisierung (memory/context_builder.py)
- [x] Memory-Management Skill (skills/memory_manager.py)
- [ ] Vektor-basierte semantische Memory-Suche (Embeddings statt Keyword-Match)
- [ ] Memory-Export/Import (Backup & Restore als JSON/Markdown)
- [ ] Hybrid-Suche: Kombination aus Vektor-Semantik und BM25-Keyword-Matching
- [ ] Temporal Decay: Neuere Erinnerungen hoeher gewichten
- [ ] Embedding-Cache: Re-Embedding unveraenderter Texte vermeiden

---

### Phase 10 - Multi-Channel Messaging

**Prioritat:** Sofort nutzlich

- [ ] Telegram-Integration (aiogram)
- [x] Discord-Integration (discord_bot/, ChannelAdapter-Abstraktion)
- [x] Einheitliches Session-Management (ChatEngine + ChannelAdapter)
- [x] Berechtigungssystem: Owner vs. oeffentliche Skills
- [x] Proaktive Benachrichtigungen (notifications/notification_service.py)
- [ ] Cross-Channel Messaging: Clara kann proaktiv ueber jeden Kanal senden

---

### Phase 11 - Automatisierung & Skripte

**Prioritat:** Produktivitat

- [x] Cron-Jobs (TaskSchedulerSkill + SchedulerEngine)
- [x] Heartbeat-Checks
- [x] Webhook-Empfanger (webhook/)
- [x] Automatische Aktionen basierend auf Ereignissen (automation/ mit EventBus)
- [x] Batch-Skript-Ausfuhrung (scripts/script_engine.py)
- [x] Proaktive Benachrichtigungen (notifications/)
- [ ] System-Events: Heartbeat-Trigger, Startup/Shutdown, Error-Events
- [ ] Event-Hooks: Benutzerdefinierte Aktionen bei Tool-Aufrufen

---

### Phase 12 - Erweiterte Skills & Tools

**Prioritat:** Produktivitat

- [x] Screenshot-Skill (ScreenshotSkill)
- [x] Clipboard-Skill (ClipboardSkill)
- [x] PDF-Dokumenten-Verarbeitung (PDFReaderSkill)
- [x] Rechnerfunktionen (CalculatorSkill)
- [x] Kalender-Integration (CalendarManagerSkill mit Google Calendar API)
- [ ] E-Mail-Integration (IMAP/SMTP)
- [ ] Bild-Analyse mit Vision-Modell
- [ ] Prozess-Manager: Hintergrund-Prozesse starten/ueberwachen/stoppen

---

### Phase 13 - Agent-System

**Prioritat:** Power-Feature

- [x] Personas/Agenten (general, coding, research, image_prompt)
- [x] Agent-Templates (YAML-basiert, data/agent_templates/)
- [x] Sub-Agenten (AgentRouter mit delegate_to_agent Tool)
- [ ] Per-Agent Tool-Profile
- [ ] Workspace & Bootstrap-Dateien pro Agent (IDENTITY.md, SOUL.md, TOOLS.md, ...)
- [ ] Spezifizitaets-basiertes Agenten-Routing

---

### Phase 14 - Erweiterte UI

**Prioritat:** Power-Feature

- [x] Dashboard mit System-Status
- [x] Projekt-Ubersicht und Aufgaben-Verwaltung
- [x] Settings-Seite (Modell-Browser, Gedaechtnis, Agenten-Vorlagen)
- [x] Datei-Upload mit Vorschau
- [x] Dark Theme
- [x] Mobile-Optimierung
- [ ] Slash-Commands (/help, /clear, /model, /agent)
- [ ] Code-Highlighting in Chat-Nachrichten
- [ ] Session-Browser

---

### Phase 15 - Sicherheit & Stabilitat

**Prioritat:** Qualitat

- [x] Passwort-Schutz (JWT + bcrypt)
- [x] Health-Check-Endpunkt (/api/health)
- [x] Rate Limiting
- [ ] Audit-Log (alle Tool-Aufrufe protokollieren)
- [ ] Automatische Backups (Scheduled Task)
- [ ] Hot-Reload: Konfigurationsaenderungen ohne Neustart
- [ ] Clara Doctor: Selbstdiagnose mit Auto-Fix

---

### Phase 16 - Voice & Multimedia

**Prioritat:** Qualitat

- [x] Sprachausgabe TTS (edge-tts, de-DE-KatjaNeural)
- [x] Bild-Upload zur Analyse
- [ ] Spracheingabe STT (Whisper lokal oder Deepgram)
- [ ] Wake Word "Hey Clara"
- [ ] Audio-Transkription (Audio/Video-Dateien zu Text)

---

### Phase 17 - Externe Integrationen

**Prioritat:** Nice-to-have

- [ ] Git-Integration (Repo-Status, Commits, Diffs)
- [ ] RSS/News-Feed (abonnieren und zusammenfassen)
- [ ] Smart Home Integration (Home Assistant / MQTT)
- [ ] Wetter-Skill
- [ ] DNS/Netzwerk-Discovery

---

### Phase 18 - Multi-Provider LLM

**Prioritat:** Produktivitat

- [ ] OpenAI-Provider (GPT-4o via API)
- [ ] Anthropic-Provider (Claude via API)
- [ ] Lokale Provider (Ollama als Basis beibehalten)
- [ ] Provider-Format: `provider/model` Syntax (z.B. `openai/gpt-4o`)
- [ ] Model-Fallback-Ketten
- [ ] Per-Agent Model-Override

---

### Phase 19 - Gateway & API-Server

**Prioritat:** Power-Feature

- [ ] OpenAI-kompatibler API-Endpunkt
- [ ] WebSocket Control-Plane (strukturiertes Protokoll)
- [ ] Health-Metriken-API (CPU, RAM, GPU, Modell-Status)
- [ ] Multi-Client-Support: Mehrere UIs gleichzeitig verbunden
- [ ] Event-Streaming: Clients koennen Events abonnieren

---

### Phase 20 - Browser-Automatisierung

**Prioritat:** Produktivitat

- [ ] Playwright-Integration als Browser-Skill
- [ ] Navigation, Seiten-Snapshot, Screenshot
- [ ] Elemente klicken, Formulare ausfuellen
- [ ] Browser-Profile: Persistente Sessions mit Cookies/Login
- [ ] JavaScript ausfuehren auf der Seite

---

### Phase 21 - Session-Management

**Prioritat:** Power-Feature

- [ ] Session-Liste und History
- [ ] Session-Spawn: Neue parallele Agent-Sessions starten
- [ ] Session-Export: Konversation als Markdown/JSON
- [ ] Session-Fork: Ab einem Punkt duplizieren und fortsetzen
- [ ] Taeglich/Idle-Reset-Fenster (konfigurierbares Reset-Zeitfenster)

---

### Phase 22 - Node & Device-Steuerung

**Prioritat:** Nice-to-have

- [ ] Node-Discovery: Gepaarte Geraete im Netzwerk finden
- [ ] Node-Befehle: Shell-Commands auf Remote-Nodes
- [ ] Android/iOS Companion-App (oder Termux Bridge)
- [ ] Kamera/Screen-Capture von Remote-Geraeten

---

### Phase 23 - CLI & Diagnostik

**Prioritat:** Qualitat

- [ ] `clara status` — System-Health anzeigen
- [ ] `clara doctor` — Diagnose mit Auto-Fix (Ollama, DB, Config)
- [ ] `clara message` — Nachricht ueber beliebigen Kanal senden
- [ ] `clara logs` — Gateway-Logs anzeigen
- [ ] `clara models list/set` — Modelle verwalten

---

### Phase 24 - Canvas & Dynamic UI

**Prioritat:** Nice-to-have

- [ ] Canvas-System: Agent erstellt HTML/CSS/JS-Panels dynamisch
- [ ] Interaktive Dashboards und Diagramme
- [ ] Formular-Generierung fuer strukturierte Dateneingabe
- [ ] Canvas-Persistenz: erstellte Panels speichern

---

### Phase 25 - Claude Code Integration

**Prioritat:** Power-Feature

- [ ] Claude Code als Subprocess starten und steuern
- [ ] CodingSkill: Clara delegiert Coding-Auftraege an Claude Code
- [ ] Streaming-Output in Echtzeit an Clara-UI weiterleiten
- [ ] Auto-Commit nach Aenderungen mit sinnvoller Message
- [ ] PR-Erstellung via gh CLI

---

### Phase 26 - Kontext-Management & Kompaktierung

**Prioritat:** Power-Feature

- [ ] /compact Befehl: Manuelle Kontext-Zusammenfassung
- [ ] Auto-Kompaktierung wenn Kontext ans Token-Limit stoesst
- [ ] /context list: Injizierte Dateien und Token-Groessen anzeigen
- [ ] Tool-Output-Groessenbeschraenkung (Anfang + Ende behalten)

---

### Phase 27 - Workspace & Bootstrap-System

**Prioritat:** Power-Feature

- [ ] Standardisierte Workspace-Dateien pro Agent: IDENTITY.md, SOUL.md, TOOLS.md, MEMORY.md
- [ ] BOOT.md: Optionale Startup-Checkliste
- [ ] BOOTSTRAP.md: Einmaliges Ersteinrichtungs-Ritual (wird nach Ausfuehrung entfernt)
- [ ] WorkspaceLoader: injiziert Markdown-Dateien in System-Prompts zur Laufzeit
- [ ] TOOLS.md wird bei jedem Start aus live Skill-Registry regeneriert
- [ ] Workspace als Git-Repo: Backup und Machine-Migration per git clone

---

### Phase 28 - Streaming-Optimierung

**Prioritat:** Qualitat

- [ ] EmbeddedBlockChunker mit konfigurierbaren Break-Hierarchien
- [ ] Code-Fence-Schutz: Kein Stream-Split innerhalb von Code-Bloecken
- [ ] Human-like Pacing: Randomisierte Pausen zwischen Block-Antworten
- [ ] Pro-Kanal Streaming-Steuerung (blockStreaming, chunkMode, etc.)

---

### Phase 29 - OAuth & Multi-Account-Auth

**Prioritat:** Produktivitat

- [ ] OAuth fuer LLM-Provider (PKCE-Flow)
- [ ] Automatisches Token-Refresh mit Ablauf-Tracking
- [ ] Multi-Account: Isolierte Agenten oder Profile-basiertes Routing
- [ ] Per-Session Modell-Override via /model @profileId

---

### Phase 30 - Plugin & Hook-System

**Prioritat:** Nice-to-have

- [ ] Plugin-Hooks: before_model_resolve, before_prompt_build, before_tool_call, after_tool_call
- [ ] Session-Grenz-Hooks: on_session_start, on_session_end, on_compaction
- [ ] Command-Lifecycle-Interception: Eigene Slash-Commands als Plugins
- [ ] Plugin-Marketplace (clawhub-Aequivalent)

---

### Empfehlungen fur die Umsetzung

**Prioritaeten fuer Sofort-Nutzen:**
1. **Phase 18** — Multi-Provider (GPT-4o, Claude fuer komplexe Aufgaben)
2. **Phase 20** — Browser-Automatisierung (Web-Interaktion)
3. **Phase 10** — Telegram (Mobile Erreichbarkeit)
4. **Phase 15** — Sicherheit (Hot-Reload, Doctor)
5. **Phase 23** — CLI (Schnellzugriff ohne Browser)

**Modularer Aufbau fuer neue Phasen:**
- `providers/` — Provider-ABC + Implementierungen pro LLM-Anbieter
- `cli/` — Typer-basiertes CLI-Framework
- `browser/` — Playwright-Wrapper + BrowserSkill
