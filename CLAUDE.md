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
- **`web/routes.py`** — WebSocket chat handler, system prompt, tool-call loop
- **`llm/ollama_client.py`** — Ollama API wrapper (`chat`, `generate`, `embed`); supports per-request model override
- **`config.py`** — All config via env vars + `AGENTS` dict defining multi-agent setup

### Skill System

Skills inherit from `BaseSkill` (name, description, parameters, execute). Registered in `SkillRegistry` at startup. Tool definitions are auto-generated in OpenAI function-calling format.

Skills: `file_manager`, `system_command`, `web_browse`, `web_fetch`, `project_manager`, `task_scheduler`, `image_generation`

### Multi-Agent System

4 agents configured in `Config.AGENTS` (general, coding, research, image_prompt), each with its own Ollama model, system prompt, and skill subset. The main model gets a `delegate_to_agent` tool — specialists cannot delegate further. Agent routing happens in `agents/agent_router.py`.

### Data Layer

SQLite via aiosqlite. Tables: `conversations` (chat history), `memory` (key-value), `projects`, `tasks`. Database file: `data/clara.db`.

### Frontend

Vanilla HTML/CSS/JS in `web/static/`. WebSocket protocol sends `message`, `tool_call`, `image`, and `error` event types. Images from `/generated/` are rendered inline.

## Conventions

- All assistant responses must be in German (system prompt enforces this)
- Image generation prompts must be in English (even when user asks in German)
- System prompts in config use ASCII-safe German (ae/oe/ue instead of umlauts) since they're in Python strings
- No test suite exists; verify changes by running the app
- `data/` directory is git-ignored (runtime data, DB, generated images, logs)
