# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

```bash
pip install -r requirements.txt
python main.py  # Starts on http://127.0.0.1:8080
```

Requires Ollama running at `http://localhost:11434`. Stable Diffusion Forge is optional (auto-launched if found at `SD_FORGE_DIR`).

## Architecture

Clara is a locally-hosted AI assistant with a web UI. Everything runs async on FastAPI + WebSocket.

**Core flow:** User message → WebSocket → LLM chat with tools (max 5 rounds) → tool execution → response back via WebSocket.

### Key Components

- **`main.py`** — FastAPI app entry point, skill registration, lifespan management
- **`web/routes.py`** — WebSocket chat handler, system prompt, tool-call loop, streaming, think-block stripping
- **`llm/ollama_client.py`** — Ollama API wrapper (`chat`, `chat_stream`, `generate`, `embed`); uses a shared persistent `aiohttp.ClientSession`
- **`config.py`** — All config via env vars + `AGENTS` dict defining multi-agent setup
- **`agents/agent_router.py`** — Specialist agent delegation; has its own think-stripping

### Skill System

Skills inherit from `BaseSkill` (name, description, parameters, execute). Registered in `SkillRegistry` at startup. Tool definitions are auto-generated in OpenAI function-calling format.

Skills: `file_manager`, `system_command`, `web_browse`, `web_fetch`, `project_manager`, `task_scheduler`, `image_generation`, `memory_manager`

### Multi-Agent System

4 agents configured in `Config.AGENTS` (general, coding, research, image_prompt), each with its own Ollama model, system prompt, and skill subset. The main model gets a `delegate_to_agent` tool — specialists cannot delegate further. Agent routing happens in `agents/agent_router.py`.

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
The qwen models emit `<think>...</think>` reasoning blocks and CJK filler lines. Both `routes.py` and `agent_router.py` have `_strip_think()` that:
1. Strips `<think>...</think>` blocks via regex
2. Removes unclosed `<think>` tags
3. Drops lines containing only non-Latin characters (CJK filler)

Any new response path must apply `_strip_think()` before sending to the frontend.

### Image deduplication
When a tool returns markdown images (`![alt](/generated/...)`), the image is sent as a separate `image` WS event and the markdown is replaced with `[Bild wurde angezeigt]` in the tool result before passing to the LLM. This prevents the model from repeating the image in its summary. Both `routes.py` and `agent_router.py` implement this.

### Streaming with think-block buffering
The streaming path in `routes.py` buffers tokens until `</think>` is seen, then streams the cleaned text. This prevents think-block content from flashing on screen.

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
