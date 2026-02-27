# Clara - TODOS & Machine Readiness

## Umgebungs-Uebersicht

Clara hat **zwei Umgebungen** — beide muessen beruecksichtigt werden:

| | Dev-PC (Windows 11) | Prod-VM (Proxmox) |
|-|---------------------|-------------------|
| OS | Windows 11 Pro | Ubuntu 22.04 |
| Pfad | `C:\Users\Marlon\Desktop\Clara` | `/opt/clara` |
| User | Marlon | `clara` (systemd) |
| GPU | — | GTX 3060 12GB |
| RAM | — | 32 GB |
| Disk | — | 1 TB SSD |
| Deployment | `git push` | `ssh root@<VM_IP> '/opt/clara/deploy/update.sh'` |
| Prozessmanager | — | systemd (`clara.service`) |
| Logs | — | `journalctl -u clara -f` |

---

## Maschinen-Bereitschaft

### Dev-PC (Windows 11)

| Tool | Status | Aktion |
|------|--------|--------|
| Node.js | v24.12.0 ✅ | — |
| npm | v11.6.2 ✅ | — |
| pnpm | nicht installiert ⚠️ | `npm install -g pnpm` (optional, nur fuer Node-Tools) |
| Python | 3.10.11 ✅ | — |
| Git | v2.52.0 ✅ | — |
| Docker Desktop | nicht installiert ⚠️ | Fuer lokale Phase-31-Tests benoetigt |
| Ollama | — | `http://localhost:11434` pruefen (oder nur auf VM nutzen) |

### Prod-VM (Ubuntu 22.04 auf Proxmox)

| Tool | Status | Aktion |
|------|--------|--------|
| Python 3.10+ | ✅ (laut deploy/) | — |
| Git | ✅ | safe.directory konfiguriert via update.sh |
| pip / venv | ✅ | — |
| systemd | ✅ | `clara.service` aktiv |
| NVIDIA Driver | ✅ (bereits vorhanden) | — |
| Docker | nicht installiert ⚠️ | `apt install docker.io` fuer Phase 31 (Sandbox) |
| sqlite-vec | nicht installiert ⚠️ | `pip install sqlite-vec` fuer Phase 9 (Vektor-Memory) |
| Playwright | nicht installiert ⚠️ | `pip install playwright && playwright install chromium` fuer Phase 20 |
| pnpm/Node.js | nicht benoetigt | Clara ist Python-Stack |

### VM Setup-Befehle (einmalig, per SSH)

```bash
# Docker installieren (fuer Phase 31 - Sandbox-Isolation)
apt update && apt install -y docker.io
systemctl enable --now docker
usermod -aG docker clara

# sqlite-vec installieren (fuer Phase 9 - Vektor-Memory)
/opt/clara/venv/bin/pip install sqlite-vec

# Playwright installieren (fuer Phase 20 - Browser-Automatisierung)
/opt/clara/venv/bin/pip install playwright
/opt/clara/venv/bin/playwright install chromium --with-deps

# pytest fuer CI/CD auf VM (Phase 35)
/opt/clara/venv/bin/pip install pytest pytest-asyncio pytest-cov ruff mypy
```

---

## Aktuelle Aufgaben (Nach Prioritaet)

### Kritisch / Sofort

- [ ] **Phase 18: Multi-Provider LLM** — OpenAI/Anthropic API als Fallback einrichten
  - Neuer `providers/` Ordner mit `base.py`, `ollama.py`, `openai.py`, `anthropic.py`
  - Config-Format: `provider/model` (z.B. `openai/gpt-4o`, `anthropic/claude-sonnet-4-6`)
  - `.env.example` erweitern: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
  - VM: Nach Deploy `systemctl restart clara` nicht vergessen

- [ ] **Phase 35: Test-Infrastruktur** — Erste Tests schreiben, bevor mehr Code entsteht
  - `pip install pytest pytest-asyncio pytest-cov ruff`
  - Verzeichnis `tests/` mit `test_engine.py`, `test_skills.py`, `test_adapters.py`
  - `pyproject.toml` mit Pytest-Konfiguration und 70%-Coverage-Ziel
  - GitHub Actions `.github/workflows/test.yml` fuer automatische Tests bei Push

- [ ] **Phase 15: Hot-Reload** — Config-Aenderungen ohne `systemctl restart clara`
  - `watchfiles` fuer `config.py` und `.env` nutzen
  - Kritisch auf VM: Jeder Neustart unterbricht aktive Chats/WebSocket-Verbindungen

### Hoch / Naechste Woche

- [ ] **Phase 10: Telegram-Kanal** — `aiogram` (async, Python 3.10+)
  - Neues `telegram_bot/` Verzeichnis analog zu `discord_bot/`
  - `TelegramAdapter(ChannelAdapter)` implementieren
  - VM `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`
  - Vorteil gegenueber Discord: Kein Port-Forwarding noetig, Telegram-Server verbinden sich zu Bot

- [ ] **Phase 9: Vektor-Memory** — SQLite + sqlite-vec (wie OpenClaw)
  - VM: `pip install sqlite-vec` (einmalig)
  - Embedding-Provider: Ollama (`nomic-embed-text`) — laeuft bereits auf VM
  - Hybrid-Suche: 70% Vektor + 30% BM25 (FTS5 bereits in SQLite verfuegbar)
  - DB liegt auf SSD (`/opt/clara/data/clara.db`) — Performance gut

- [ ] **Phase 20: Browser-Automatisierung** — Playwright auf VM
  - VM: Chromium headless, kein Display benoetigt (`--no-sandbox` fuer clara-User beachten)
  - VM GPU nicht genutzt von Playwright — kein Konflikt mit SD Forge
  - Sicherheit: Browser-Skill nur mit expliziter Erlaubnis (kein Default-Allow)

- [ ] **Phase 23: Clara CLI** — `clara status` und `clara doctor` als erstes
  - `pip install typer rich`
  - `cli/` Verzeichnis, startbar als `python -m clara.cli` oder via Alias
  - VM: Als `clara`-User ausfuehrbar, liest `clara.service` Status via `systemctl`
  - `clara doctor`: prueft Ollama, DB, clara.service, Disk-Space, GPU-Status

### Mittel / Diesen Monat

- [ ] **Phase 31: Secrets-Management** — Schicht-System mit Pydantic-Settings
  - Reihenfolge: Env-Var → secrets.json → .env → Defaults
  - VM: Secrets in `/opt/clara/.env` (nur clara-User lesbar, chmod 600)
  - Kein Hardcoding von Keys in `config.py`

- [ ] **Phase 35: CI/CD auf GitHub Actions**
  - `.github/workflows/deploy.yml`: Bei Push auf `main` → `ssh root@<VM_IP> update.sh`
  - SSH-Key als GitHub Secret hinterlegen (`VM_SSH_KEY`)
  - Nur deployen wenn Tests bestehen (depends-on: test job)

- [ ] **Phase 26: Kontext-Kompaktierung** — `/compact` Befehl
  - VM: 32 GB RAM — kein Speicherproblem, aber Token-Limit des Modells bleibt Engpass
  - Auto-Trigger wenn Kontext 80% des Modell-Kontextfensters erreicht

- [ ] **Phase 27: Workspace-System**
  - VM: Pro Agent eigenes Verzeichnis unter `/opt/clara/data/agents/<agentId>/workspace/`
  - IDENTITY.md, SOUL.md, TOOLS.md per Agent-Template generieren

### Niedrig / Nice-to-have

- [ ] **Phase 31: Docker-Sandbox** auf VM
  - `apt install docker.io` + `usermod -aG docker clara`
  - Tool-Ausfuehrung in Wegwerf-Containern (kein Einfluss auf Host-System)
  - GPU-Passthrough fuer Sandbox-Container beachten (`--gpus` Flag)

- [ ] **Phase 33: Computer-Use** — pyautogui auf VM schwierig (kein Display)
  - VM: Nur via xvfb (virtueller Framebuffer) oder VNC-Session nutzbar
  - Sinnvoller auf Dev-PC Windows mit pyautogui (kein Display-Problem)
  - Hybrid: Computer-Use-Skill nur aktiv wenn `DISPLAY` gesetzt

- [ ] **Phase 22: Node & Device** — Android-Bridge
  - VM: ADB ueber Netzwerk (`adb connect <phone_ip>`) ohne USB moeglich
  - Termux:API als leichtgewichtige Alternative zur nativen App

---

## Technische Schulden

- [ ] `memory/database.py` — Fehlende Tabellen fuer ACP-Threads (Phase 32) und sqlite-vec (Phase 9)
- [ ] `config.py` — Kein Schicht-System fuer Secrets (Phase 31)
- [ ] `chat/engine.py` — Kein Token-Zaehler fuer Auto-Kompaktierung (Phase 26)
- [ ] Kein `tests/` Verzeichnis — dringend anlegen (Phase 35)
- [ ] `skills/` — Kein `browser_skill.py` (Phase 20)
- [ ] `providers/` Verzeichnis fehlt (Phase 18)
- [ ] `deploy/update.sh` — kein automatischer Test-Run vor Deployment

---

## Deployment-Workflow (Erinnerung)

```bash
# 1. Lokal entwickeln und testen
python main.py  # Dev-Server auf http://127.0.0.1:8080

# 2. Aenderungen committen und pushen
git add . && git commit -m "feat: ..." && git push

# 3. Auf VM deployen
ssh root@<VM_IP> '/opt/clara/deploy/update.sh'

# 4. VM-Logs pruefen
ssh root@<VM_IP> 'journalctl -u clara -f'
```

---

## Referenz: OpenClaw vs. Clara Vergleich

| Feature | OpenClaw | Clara | Status |
|---------|----------|-------|--------|
| Chat-Engine | Pi Agent Core (TS) | ChatEngine (Python) | ✅ Clara hat eigene |
| Multi-Channel | 13+ Kanaele | Discord + Web | ⚠️ Telegram fehlt |
| Memory | SQLite + sqlite-vec | SQLite keyword | ⚠️ Vektoren fehlen |
| Skill-System | ClawHub (5700+ Skills) | 16 eingebaut | ⚠️ Registry fehlt |
| Multi-Provider LLM | 8+ Provider | Nur Ollama | ❌ Muss gebaut werden |
| Browser-Control | Dedizierter Chrome | Nur web_fetch | ❌ Playwright fehlt |
| CLI | `openclaw` CLI | Kein CLI | ❌ Muss gebaut werden |
| Docker-Sandboxing | Ja | Nein | ❌ VM-seitig moeglich |
| Tests | Vitest 70% Coverage | Keine Tests | ❌ Dringend |
| ACP-Protokoll | v2026.2.26 | Fehlt | ❌ Phase 32 |
| Voice (TTS) | ElevenLabs/edge | edge-tts | ✅ Grundlage da |
| Voice (STT) | Whisper/Deepgram | Fehlt | ❌ Phase 16 |
| Webhooks | Ja | Ja | ✅ |
| Automation/Cron | Ja | Ja (APScheduler) | ✅ |
| Web UI | React (openclaw-studio) | Vanilla HTML/CSS/JS | ✅ Clara hat eigenes |
| Auth | JWT + bcrypt | JWT + bcrypt | ✅ |
| Proxmox/systemd | Nein (kein VM-Fokus) | Ja | ✅ Clara-Vorteil |
| GPU (SD Forge) | Nein | Ja (GTX 3060) | ✅ Clara-Vorteil |
