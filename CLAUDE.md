# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

```bash
pip install -r requirements.txt
python main.py  # Starts on http://127.0.0.1:8080
```

Requires Ollama running at `http://localhost:11434`. Stable Diffusion Forge is optional (auto-launched if found at `SD_FORGE_DIR`).

## Architecture

Clara is a locally-hosted AI assistant with a web UI and Discord bot. Everything runs async on FastAPI + WebSocket + discord.py.

**Core flow:** User message → Channel (WebSocket / Discord) → `ChatEngine` → LLM chat with tools (max 5 rounds) → tool execution → response back via `ChannelAdapter`.

### Key Components

- **`main.py`** — FastAPI app entry point, skill registration, lifespan management, Discord bot startup
- **`chat/engine.py`** — Channel-agnostic `ChatEngine` class: LLM tool loop, streaming, DB save, fact extraction, TTS. Shared `_strip_think()` function.
- **`chat/adapters.py`** — `ChannelAdapter` ABC + `WebSocketAdapter` implementation
- **`web/routes.py`** — WebSocket handler (uses `ChatEngine` + `WebSocketAdapter`), system prompt, HTTP routes
- **`discord_bot/bot.py`** — `ClaraDiscordBot`: responds to @mentions in servers, all DMs. Owner ID permission check.
- **`discord_bot/adapter.py`** — `DiscordAdapter`: message splitting (2000 char limit), file attachments for images/audio, embeds for tool calls
- **`llm/ollama_client.py`** — Ollama API wrapper (`chat`, `chat_stream`, `generate`, `embed`); uses a shared persistent `aiohttp.ClientSession`
- **`config.py`** — All config via env vars + Discord config + `AGENT_TEMPLATES_DIR` path
- **`agents/agent_router.py`** — Specialist agent delegation; loads templates via `TemplateLoader`; imports `_strip_think` from `chat.engine`
- **`agents/template_loader.py`** — `AgentTemplate` dataclass + `TemplateLoader` for YAML-based agent configs

### Skill System

Skills inherit from `BaseSkill` (name, description, parameters, execute). Registered in `SkillRegistry` at startup. Tool definitions are auto-generated in OpenAI function-calling format.

Skills: `file_manager`, `system_command`, `web_browse`, `web_fetch`, `project_manager`, `task_scheduler`, `image_generation`, `memory_manager`, `agent_manager`

### Multi-Agent System

Agents are defined as YAML templates in `data/agent_templates/` (builtin in `_builtin/`, user-created in `custom/`). Each agent has: name, model, system_prompt, skills, max_rounds, temperature, context_window. Custom templates override builtins with the same name. 4 builtin agents: general, coding, research, image_prompt. The main model gets a `delegate_to_agent` tool — specialists cannot delegate further. Agent routing happens in `agents/agent_router.py`. Templates are managed via the `agent_manager` skill (list, show, create, edit, clone, delete, reload).

### Data Layer

SQLite via aiosqlite. Tables: `conversations` (chat history), `memory` (key-value), `projects`, `tasks`. Indexes on `session_id`, `category`, `project_id`, `status`. Database file: `data/clara.db`.

### Frontend

Vanilla HTML/CSS/JS in `web/static/`. WebSocket protocol event types:
- `message` — complete assistant response
- `stream` / `stream_end` — token-by-token streaming for tool summaries
- `tool_call` — triggers activity cards (with spinners, icons, German labels per tool type)
- `image` — inline generated image display
- `audio` — TTS playback
- `error` — error display

Activity cards in `app.js` use `TOOL_META` and `_AGENT_META` objects for per-tool icons, colors, and German labels.

## Conventions

- All assistant responses must be in German (system prompt enforces this)
- Image generation prompts must be in English (even when user asks in German)
- Image generation adds European ethnicity hints to prompts and negative prompts by default
- System prompts in config use ASCII-safe German (ae/oe/ue instead of umlauts) since they're in Python strings
- No test suite exists; verify changes by running the app
- `data/` directory is git-ignored (runtime data, DB, generated images, logs)

## Critical Patterns

### Think-block stripping
The qwen models emit `<think>...</think>` reasoning blocks and CJK filler lines. Single source of truth: `_strip_think()` in `chat/engine.py` (imported by `agent_router.py`).
1. Strips `<think>...</think>` blocks via regex
2. Removes unclosed `<think>` tags
3. Drops lines containing only non-Latin characters (CJK filler)

Any new response path must apply `_strip_think()` before sending to the frontend.

### Image deduplication
When a tool returns markdown images (`![alt](/generated/...)`), the image is sent as a separate `image` channel event and the markdown is replaced with `[Bild wurde angezeigt]` in the tool result before passing to the LLM. This prevents the model from repeating the image in its summary. Implemented in `ChatEngine._execute_tool()` and `agent_router.py`.

### Streaming with think-block buffering
The streaming path in `ChatEngine` buffers tokens until `</think>` is seen, then streams the cleaned text. This prevents think-block content from flashing on screen. Discord adapter buffers all stream tokens and sends as a single message on `stream_end`.

### Discord bot & permission system
- `DISCORD_BOT_TOKEN` + `DISCORD_OWNER_ID` env vars in `.env`
- Owner (matching user ID) gets `allowed_skills=None` (full access)
- Other users get `Config.DISCORD_PUBLIC_SKILLS` only (`web_browse`, `web_fetch`, `image_generation`)
- Agent delegation is also restricted: non-owners can only delegate to agents whose skills are all within `DISCORD_PUBLIC_SKILLS`
- Defense in depth: tool execution validates `allowed_skills` even if LLM hallucinates a blocked tool call
- Session IDs: `discord-channel-{id}` for servers, `discord-dm-{id}` for DMs

### Async I/O
All blocking operations use `run_in_executor()`: DuckDuckGo search (`web_browse.py`), BeautifulSoup parsing (`web_fetch.py`), file read/write in routes and image generation. The `OllamaClient` and `ImageGenerationSkill` maintain persistent `aiohttp` sessions — never create per-request sessions.

### Memory system
Clara has a persistent memory system with three components:
- **`memory/context_builder.py`** — Builds dynamic memory context injected into system prompt before each LLM call. Recent memories grouped by category.
- **`memory/fact_extractor.py`** — Fire-and-forget background task after each response. Uses LLM to extract user facts from conversation and stores them via `db.remember()`.
- **`skills/memory_manager.py`** — Skill for explicit memory CRUD: remember, recall, search, forget, list_categories, stats.

Memory categories: `vorlieben`, `persoenlich`, `technik`, `ziele`, `projekte`, `gewohnheiten`, `wichtig`.

### Tool execution
Multiple tool calls in a single LLM round execute in parallel via `asyncio.gather()`. Agent delegations run sequentially. TTS and fact extraction are fire-and-forget via `asyncio.create_task()`.
