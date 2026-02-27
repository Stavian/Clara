# Clara - Roadmap

## Phasen-Ubersicht

| Phase | Bereich | Prioritat | Status |
|-------|---------|-----------|--------|
| 9 | Erweiterte Memory-Systeme | Sofort nutzlich | Fertig |
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
| 27 | Workspace & Bootstrap-System | Power-Feature | Teilweise |
| 28 | Streaming-Optimierung | Qualitat | Offen |
| 29 | OAuth & Multi-Account-Auth | Produktivitat | Offen |
| 30 | Plugin & Hook-System | Nice-to-have | Offen |
| 31 | Formales Sicherheitsmodell & Secrets | Qualitat | Offen |
| 32 | Agent Communication Protocol (ACP) | Power-Feature | Offen |
| 33 | Computer-Use & Agent Harness | Produktivitat | Offen |
| 34 | Community Skill Registry | Nice-to-have | Offen |
| 35 | Performance & Test-Infrastruktur | Qualitat | Offen |

---

## Phase 9 - Erweiterte Memory-Systeme

**Prioritat:** Sofort nutzlich

- [x] Automatische Extraktion von Fakten uber den Nutzer (memory/fact_extractor.py)
- [x] Session-Zusammenfassung und Kontext-Priorisierung (memory/context_builder.py, neuere Erinnerungen starker gewichtet)
- [x] Memory-Management Skill fur Durchsuchung und Bearbeitung von Erinnerungen (skills/memory_manager.py)
- [ ] Vektor-basierte semantische Memory-Suche (Embeddings statt Keyword-Match)
- [ ] Memory-Indexierung mit automatischem Kategorisieren neuer Eintraege
- [ ] Memory-Export/Import (Backup & Restore als JSON/Markdown)
- [ ] Tages-basierte Memory-Logs (memory/YYYY-MM-DD.md) als transiente zweite Ebene neben MEMORY.md (Langzeit-Kernfakten)
- [ ] memory_get: Gezieltes Lesen bestimmter Memory-Dateien und Zeilenbereiche
- [ ] Hybrid-Suche: Kombination aus Vektor-Semantik und BM25-Keyword-Matching
- [ ] Multi-Provider-Embeddings: OpenAI, Gemini, Voyage, lokal (llama.cpp) mit Auto-Auswahl
- [ ] MMR Re-Ranking: Balance zwischen Relevanz und Diversitaet in Suchergebnissen
- [ ] Temporal Decay: Neuere Erinnerungen hoeher gewichten (konfigurierbare Halbwertszeit)
- [ ] Embedding-Cache: Re-Embedding unveraenderter Texte vermeiden
- [ ] Provider Fingerprinting: Automatischer Reindex bei Wechsel des Embedding-Modells
- [ ] Session-Transcript-Indizierung: Semantische Suche ueber vergangene Gespraeche (experimentell)
- [ ] Memory-Zitierungen: Quellenangaben (Datei + Zeile) in Suchergebnissen
- [ ] Pre-Compaction Flush: Vor Kontext-Kompaktierung automatisch dauerhafte Erinnerungen schreiben
- [ ] Extra-Pfade: Externe Dokumentationsverzeichnisse in Memory-Suche einbeziehen

---

## Phase 10 - Multi-Channel Messaging

**Prioritat:** Sofort nutzlich

- [ ] Integration von Telegram als Kommunikationskanal (grammY oder python-telegram-bot)
- [x] Integration von Discord als Kommunikationskanal (discord_bot/, ChannelAdapter-Abstraktion)
- [ ] Integration von WhatsApp als Kommunikationskanal (Baileys-basiert oder whatsapp-web.js Bridge)
- [ ] Integration von Signal als Kommunikationskanal (signal-cli Bridge)
- [ ] Integration von Slack als Kommunikationskanal (Bolt SDK oder Webhook)
- [ ] Integration von Matrix als Kommunikationskanal (matrix-nio)
- [ ] Integration von IRC als Kommunikationskanal (mit Allowlist-Steuerung)
- [x] Einheitliches Session-Management uber alle Kanale (ChatEngine + ChannelAdapter in chat/)
- [x] Berechtigungssystem: Owner vs. oeffentliche Skills per User-ID
- [x] Proaktive Benachrichtigungen und Kanal-Router (notifications/notification_service.py)
- [ ] Cross-Channel Messaging: Clara kann proaktiv Nachrichten ueber jeden Kanal senden
- [ ] Kanal-spezifische Features (Reaktionen, Medien, Edits je nach Plattform)
- [ ] DM-Pairing: Neue Nutzer muessen per Anfrage freigeschaltet werden
- [ ] Gruppen-Chat Support (Clara reagiert nur auf @Mention in Gruppen)
- [ ] Twitch-Kanal-Integration (Chat-Commands und Stream-Events, v2026.2.23)
- [ ] Google Chat Integration (Spaces und DMs via Google Chat API, v2026.2.23)
- [ ] Zalo / Zalo Personal Unterstuetzung (vietnamesischer Messenger)
- [ ] WebChat-Widget: Einbettbarer Chat-Button fuer externe Websites
- [ ] directPolicy: Granulare Richtlinien fuer DM-Zugang statt einfachem DM-Toggle (v2026.2.25)

---

## Phase 11 - Automatisierung & Skripte

**Prioritat:** Produktivitat

- [x] Cron-Jobs (TaskSchedulerSkill + SchedulerEngine)
- [x] Heartbeat-Checks (Heartbeat-System mit konfigurierbarem Intervall)
- [x] Webhook-Empfanger (webhook/ mit Token-Auth, WebhookManagerSkill)
- [x] Automatische Aktionen basierend auf Ereignissen (automation/ mit EventBus + AutomationEngine)
- [x] Batch-Skript-Ausfuhrung (scripts/script_engine.py, BatchScriptSkill)
- [x] Proaktive Benachrichtigungen (notifications/notification_service.py, Web + Discord)
- [ ] System-Events: Heartbeat-Trigger, Startup/Shutdown-Events, Error-Events
- [ ] Webhook-Runner mit Gmail/E-Mail Pub/Sub Integration
- [ ] Event-Hooks: Benutzerdefinierte Aktionen bei Tool-Aufrufen oder Kanal-Events

---

## Phase 12 - Erweiterte Skills & Tools

**Prioritat:** Produktivitat

- [x] Screenshot-Skill (ScreenshotSkill mit mss, Full/Monitor/Region)
- [x] Clipboard-Skill (ClipboardSkill mit pyperclip, Read/Write)
- [ ] E-Mail-Integration (Senden/Empfangen/Suchen via IMAP/SMTP)
- [x] PDF-Dokumenten-Verarbeitung (PDFReaderSkill mit pdfplumber, Text/Tabellen/Info)
- [x] Code-Ausfuhrung (lokal) (SystemCommandSkill)
- [x] Bild-Verarbeitung (lokal) (ImageGenerationSkill mit Stable Diffusion)
- [ ] Audio-Verarbeitung (lokal)
- [x] Rechnerfunktionen (CalculatorSkill mit sicherer AST-Auswertung, Einheitenumrechnung)
- [x] Kalender-Integration (CalendarManagerSkill mit Google Calendar API)
- [ ] Bild-Analyse mit Vision-Modell (Bilder beschreiben/analysieren via LLM)
- [ ] apply_patch: Multi-Datei-Edits als strukturierter Patch
- [ ] Prozess-Manager: Hintergrund-Prozesse starten, ueberwachen, stoppen, Logs abrufen
- [ ] Loop-Detection: Erkennung von repetitiven Tool-Call-Mustern (Endlosschleifen verhindern)
- [ ] Tool-Profile: Vordefinierte Tool-Sets (minimal, coding, full) pro Agent/Kontext
- [ ] Tool Allow/Deny-Listen: Fein-granulare Steuerung welche Tools wann verfuegbar sind

---

## Phase 13 - Agent-System

**Prioritat:** Power-Feature

- [x] Personas/Agenten fur verschiedene Aufgaben (general, coding, research, image_prompt)
- [x] Agent-Workspace mit individueller Konfiguration (eigenes Modell, System-Prompt, Skills pro Agent)
- [x] Sub-Agenten fur effiziente Aufgabenverteilung (AgentRouter mit delegate_to_agent Tool)
- [x] Agent-Templates (YAML-basiert in data/agent_templates/, AgentManagerSkill fuer CRUD)
- [ ] Agent-Discovery: agents_list Tool zum Auflisten verfuegbarer Agenten mit Status
- [ ] Per-Agent Tool-Profile: Jeder Agent bekommt nur seine erlaubten Tools
- [ ] Agent-Fallback-Ketten: Wenn ein Agent fehlschlaegt, naechsten Agent versuchen
- [ ] Agent-Isolation: Separate Workspaces und Kontexte pro Agent-Ausfuehrung
- [ ] Standardisierte Bootstrap-Dateien im Agent-Workspace (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, TOOLS.md, HEARTBEAT.md)
- [ ] Einmaliges Bootstrap-Ritual: Ersteinrichtungs-Q&A; BOOTSTRAP.md wird nach Ausfuehrung entfernt
- [ ] Spezifizitaets-basiertes Agenten-Routing (8 Stufen: Peer > Parent-Peer > Guild+Rolle > Guild > Team > Account > Kanal > Default-Fallback)
- [ ] Multi-Account-Routing: Gleicher Kanal, mehrere Accounts → verschiedene Agenten
- [ ] DM-Splitting: DMs nach Absender-ID an verschiedene Agenten routen
- [ ] Agenten-zu-Agenten-Kommunikation (standardmaessig deaktiviert, explizit aktivierbar)
- [ ] Per-Session Sandbox-Workspaces fuer Sub-Agent-Ausfuehrungen

---

## Phase 14 - Erweiterte UI

**Prioritat:** Power-Feature

- [x] Dashboard mit System-Status (Ollama/SD/Discord Status, Statistiken, Aktivitaet, Skills, Agenten, Jobs)
- [x] Projekt-Ubersicht (Projekte-View mit Karten, Status-Badges, Fortschrittsbalken, CRUD)
- [x] Aufgaben-Verwaltung (Task-Panel pro Projekt, Status-Cycling, Prioritaeten, Erstellen/Loeschen)
- [x] Speicherverbrauch-Anzeige (Dashboard-Sektion mit Balkendiagramm, Speicher nach Kategorie)
- [x] Settings-Seite (Modell-Browser, Gedaechtnis-Verwaltung, Agenten-Vorlagen, Systeminfo)
- [ ] Slash-Commands (Chat-Befehle wie /help, /clear, /model, /agent)
- [x] Datei-Upload (Bild-Upload mit Vorschau und Clipboard-Paste)
- [ ] Code-Highlighting (Syntax-Hervorhebung in Chat-Nachrichten)
- [x] Dark/Light-Theme (Gemini-inspiriertes Dark Theme mit Blue-Accent)
- [x] Mobile-Optimierung (responsive Layout, Dashboard-Grid-Anpassung)
- [ ] TUI: Terminal-basierte UI als Alternative zum Web-Interface
- [ ] Fortschrittsanzeigen: Progress-Bars und Spinner fuer lang laufende Operationen
- [ ] Session-Browser: Gespeicherte Konversationen durchsuchen und fortsetzen

---

## Phase 15 - Sicherheit & Stabilitat

**Prioritat:** Qualitat

- [x] Passwort-Schutz (Token/Passwort-Auth fuer Web-UI und API)
- [ ] Audit-Log (Alle Tool-Aufrufe und Aktionen protokollieren)
- [ ] Tool-Richtlinien (Allow/Deny-Regeln pro Kanal und Nutzer)
- [ ] Automatische Backups (DB, Config, Memory als Scheduled Task)
- [x] Health-Check-Endpunkt (/api/health mit Ollama-Status)
- [ ] Graceful Error Recovery (Automatisches Wiederherstellen nach Fehlern)
- [x] Rate Limiting (Anfragen pro Zeiteinheit begrenzen)
- [ ] Clara Doctor (Selbstdiagnose-Tool mit Auto-Fix)
- [ ] Security Audit: Konfiguration auf Sicherheitsprobleme pruefen
- [ ] Idempotente Tool-Calls: Sichere Wiederholung bei Netzwerk-Fehlern
- [ ] Graceful Shutdown: Laufende Operationen sauber beenden vor Stopp
- [ ] Hot-Reload: Konfigurationsaenderungen ohne Neustart uebernehmen
- [ ] TLS-Unterstuetzung mit optionalem Zertifikat-Pinning
- [ ] Geraete-Pairing mit Genehmigungsworkflow (Challenge-Signing fuer Remote-Verbindungen)
- [ ] Tailscale/VPN-Unterstuetzung als bevorzugter Remote-Zugriffsweg
- [ ] SSH-Tunnel-Unterstuetzung als VPN-Alternative
- [ ] Docker Namespace-Join blockiert per Standard (Sandbox-Haertung, v2026.2.25)
- [ ] Formales Sicherheitsmodell: Dokumentiertes Bedrohungsmodell und Absicherungsschichten (v2026.2.23)
- [ ] Tool-Richtlinien-Stack: Profile → Global → Provider → Agent → Sandbox
- [ ] Prompt-Injection-Erkennung: Input-Bereinigung und aktive Warnmeldungen an den Nutzer

---

## Phase 16 - Voice & Multimedia

**Prioritat:** Qualitat

- [ ] Spracheingabe (Speech-to-Text, z.B. Whisper lokal oder Deepgram)
- [x] Sprachausgabe (TTS) (edge-tts mit de-DE-KatjaNeural, Toggle-Button im UI)
- [ ] Wake Word "Hey Clara" (lokale Wake-Word-Erkennung)
- [x] Bild-Upload (Bilder an Clara senden zur Analyse, Clipboard-Paste)
- [ ] Kamera-Zugriff (Kamera-Bild aufnehmen und analysieren)
- [ ] Screen-Recording (Bildschirmaufnahme starten/stoppen)
- [ ] Audio-Transkription (Audio/Video-Dateien zu Text)
- [ ] Talk/Gateway Provider-agnostische Konfiguration (TTS/STT unabhaengig vom LLM-Provider, v2026.2.24)
- [ ] ElevenLabs TTS als Premium-Sprachausgabe-Option (neben edge-tts)
- [ ] Always-on Sprachmodus: Kontinuierliche Spracherkennung mit Wake-Word-Aktivierung

---

## Phase 17 - Externe Integrationen

**Prioritat:** Nice-to-have

- [ ] Plugin-System fur benutzerdefinierte Skills (Install/Enable/Disable/Troubleshoot)
- [ ] Git-Integration (Repo-Status, Commits, Diffs, Branches)
- [ ] RSS/News-Feed (Feeds abonnieren und zusammenfassen)
- [ ] Smart Home Integration (Home Assistant / MQTT)
- [ ] Spotify Integration
- [ ] Wetter-Skill
- [ ] DNS/Netzwerk-Discovery (Geraete im lokalen Netz finden)
- [ ] Event-Hooks System: Plugins koennen auf Events reagieren

---

## Phase 18 - Multi-Provider LLM

**Prioritat:** Produktivitat

- [ ] OpenAI-Provider (GPT-4, GPT-4o via API)
- [ ] Anthropic-Provider (Claude via API)
- [ ] Lokale Provider beibehalten (Ollama als Basis)
- [ ] OpenRouter als Unified-Gateway (Zugriff auf 100+ Modelle)
- [ ] LiteLLM-Integration (einheitliche API fuer alle Provider)
- [ ] Provider-Format: `provider/model` Syntax (z.B. `ollama/qwen3`, `openai/gpt-4o`)
- [ ] Model-Aliase: Kurznamen fuer haeufig genutzte Modelle (z.B. `smart` → `openai/gpt-4o`)
- [ ] Model-Fallback-Ketten: Wenn ein Modell nicht erreichbar, naechstes versuchen
- [ ] Model-Auth-Verwaltung: API-Keys pro Provider sicher speichern
- [ ] Model-Discovery: Verfuegbare Modelle scannen und auflisten
- [ ] Per-Agent Model-Override: Jeder Agent kann eigenen Provider/Modell nutzen
- [ ] Vision-Modell-Routing: Bild-Anfragen automatisch an Vision-faehiges Modell
- [ ] KIMI K2.5 Unterstuetzung (v2026.2.23)
- [ ] Xiaomi MiMo-V2-Flash Unterstuetzung (v2026.2.23)
- [ ] OpenAI Codex via WebSocket-first Transport (v2026.2.26)
- [ ] AWS Bedrock Provider (Claude, Titan, Llama via AWS)
- [ ] LM Studio Provider (lokal, OpenAI-kompatibler Endpunkt)
- [ ] vLLM Provider (hochperformant, lokal gehostet)

---

## Phase 19 - Gateway & API-Server

**Prioritat:** Power-Feature

- [ ] OpenAI-kompatibler API-Endpunkt (Clara als Drop-in fuer OpenAI-API)
- [ ] WebSocket Control-Plane (strukturiertes Protokoll statt einfacher Events)
- [ ] Request/Response-Frames mit JSON-Schema-Validierung
- [ ] Token-basierte API-Authentifizierung
- [ ] Health-Metriken-API (CPU, RAM, GPU, Modell-Status, aktive Sessions)
- [ ] Hot-Reload: Konfiguration aendern ohne Neustart
- [ ] Multi-Client-Support: Mehrere UIs/Clients gleichzeitig verbunden
- [ ] Event-Streaming: Clients koennen Events abonnieren (presence, agent, tool_call)
- [ ] Idempotente API-Calls mit Request-Keys
- [ ] Praesenz-System: Verbundene Clients tracken (Gateway, UI, CLI, Nodes) mit TTL und Deduplizierung
- [ ] Praesenz-Modi: ui, webchat, cli, backend, probe, test, node — mit stabiler instanceId
- [ ] Nachrichten-Warteschlange (Queue) mit konfigurierbaren Modi: Steer, Followup, Collect, Interrupt
- [ ] Lane-aware Parallelitaet mit konfigurierbaren Concurrent-Limits pro Lane
- [ ] Queue-Overflow-Behandlung: Drop-old, Drop-new oder Summarize verworfener Nachrichten
- [ ] Message-Debouncing: Schnell aufeinanderfolgende Nachrichten zu einem Turn zusammenfassen
- [ ] Duplikat-Prevention: Kurzzeitiger Cache gegen Channel-Redeliveries
- [ ] Retry-System: Per-Request Retry mit Jitter (Standard: 3 Versuche, max 30s Delay)
- [ ] Provider-spezifische Retry-Logik (Discord: nur HTTP 429, Telegram: mehrere Fehlertypen)
- [ ] Directive-Parsing: Trennung von Prompt-Body und Command-Body in eingehenden Nachrichten
- [ ] History-Wrapping mit Absender-Labels fuer Gruppen-Chats
- [ ] Message-Prefix-Kaskadierung ueber Account/Kanal/Global-Ebene

---

## Phase 20 - Browser-Automatisierung

**Prioritat:** Produktivitat

- [ ] Playwright-Integration als Browser-Skill
- [ ] Browser starten/steuern (Chrome/Edge/Firefox)
- [ ] Navigation: URL oeffnen, zurueck, vorwaerts, neuladen
- [ ] Seiten-Snapshot: DOM als Text fuer LLM-Analyse
- [ ] Screenshot der aktuellen Seite
- [ ] Elemente klicken, Text eingeben, Formulare ausfuellen
- [ ] Tab-Management: Oeffnen, schliessen, wechseln
- [ ] Browser-Profile: Persistente Sessions mit Cookies/Login
- [ ] JavaScript ausfuehren auf der Seite
- [ ] Warten auf Elemente/Navigation (Smart Waits)

---

## Phase 21 - Session-Management

**Prioritat:** Power-Feature

- [ ] Session-Liste: Alle aktiven und gespeicherten Sessions anzeigen
- [ ] Session-History: Verlauf einer Session abrufen und durchsuchen
- [ ] Session-Spawn: Neue parallele Agent-Sessions starten
- [ ] Inter-Session-Kommunikation: Nachrichten zwischen Sessions senden
- [ ] Session-Status: Aktive Tools, Laufzeit, Token-Verbrauch pro Session
- [ ] Session-Export: Konversation als Markdown/JSON exportieren
- [ ] Session-Fork: Bestehende Session duplizieren und ab einem Punkt fortsetzen
- [ ] Session-Cleanup: Alte/inaktive Sessions automatisch bereinigen
- [ ] JSONL-Transkript-Speicherung (strukturiertes Format, topic-isoliert fuer Gruppen/Foren)
- [ ] Secure DM-Mode: Kontext-Isolation pro Sender/Kanal/Account gegen Context-Leakage
- [ ] Tagliche und Idle-Reset-Fenster (konfigurierbares Reset-Zeitfenster, z.B. 04:00 Uhr)
- [ ] Identity-Links: Gleiche Person ueber mehrere Kanaele verknuepfen (Cross-Channel-Identitaet)
- [ ] Send-Policy-Controls: Zustellung nach Kanal/Chat-Typ/Session-Prefix blockierbar
- [ ] Session-Pruning: TTL-basiertes Entfernen alter Tool-Ergebnisse aus Kontext (in-memory, on-disk unveraendert)
- [ ] Pruning Soft-Trim: Anfang + Ende behalten, Mitte durch Ellipsis ersetzen
- [ ] Pruning Hard-Clear: Gesamtes Tool-Ergebnis durch Platzhalter ersetzen
- [ ] Wildcard Allow/Deny-Listen fuer selektives Pruning nach Tool-Name
- [ ] Reply-Automation: Konfigurierbare Ping-Pong-Antworten zwischen Sessions
- [ ] Sub-Agent Auto-Archivierung nach konfigurierbarer Inaktivitaetsdauer
- [ ] Mehrsprachiger Auto-Reply-Abbruch: Stopp-Erkennungswoerter in mehreren Sprachen (v2026.2.24)
- [ ] directPolicy: Fein-granulare Zugriffssteuerung pro DM-Sender statt globalem DM-Toggle (v2026.2.25)

---

## Phase 22 - Node & Device-Steuerung

**Prioritat:** Nice-to-have

- [ ] Node-Discovery: Gepaarte Geraete im Netzwerk finden
- [ ] Kamera-Zugriff ueber Remote-Nodes
- [ ] Screen-Capture von Remote-Geraeten
- [ ] Standort-Abfrage von mobilen Nodes
- [ ] Benachrichtigungen an Nodes senden
- [ ] Node-Pairing: Neue Geraete sicher koppeln (Challenge-Nonce)
- [ ] Node-Befehle: Shell-Commands auf Remote-Nodes ausfuehren
- [ ] Android/iOS Companion-App (oder Termux/Shortcuts Bridge)
- [ ] Android Companion: Nativer vierstufiger Onboarding-Ablauf (v2026.2.24)
- [ ] Android Chat-Verbesserungen: Nachrichtenverlauf, Medien-Upload, Push-Benachrichtigungen (v2026.2.25)

---

## Phase 23 - CLI & Diagnostik

**Prioritat:** Qualitat

- [ ] `clara status` — System-Health und aktive Sessions anzeigen
- [ ] `clara doctor` — Diagnose mit Auto-Fix (Ollama, DB, Config pruefen)
- [ ] `clara message` — Nachricht ueber beliebigen Kanal senden
- [ ] `clara config` — Konfiguration lesen/schreiben (non-interaktiv)
- [ ] `clara logs` — Gateway-Logs anzeigen (farbig, filterbar)
- [ ] `clara models list` — Verfuegbare Modelle auflisten
- [ ] `clara models set` — Standard-Modell aendern
- [ ] `clara agents` — Agenten verwalten (list, create, delete)
- [ ] `clara sessions` — Sessions auflisten und verwalten
- [ ] `clara memory search` — Memory durchsuchen von der Kommandozeile
- [ ] `clara security` — Sicherheits-Audit der Konfiguration
- [ ] `clara backup` — Manuelles Backup von DB und Config
- [ ] `clara update` — Clara aktualisieren (git pull + pip install)
- [ ] `clara reset` — Zuruecksetzen auf Standardkonfiguration

---

## Phase 24 - Canvas & Dynamic UI

**Prioritat:** Nice-to-have

- [ ] Canvas-System: Agent kann HTML/CSS/JS-Panels dynamisch erstellen
- [ ] Interaktive Dashboards: Clara generiert Live-Visualisierungen
- [ ] Formular-Generierung: Clara erstellt Eingabeformulare fuer strukturierte Daten
- [ ] Diagramme und Charts: Daten als interaktive Grafiken darstellen
- [ ] Mini-Apps: Clara baut kleine Werkzeuge als eingebettete Web-Apps
- [ ] Canvas-Persistenz: Erstellte Panels speichern und wieder aufrufen
- [ ] Agent-zu-UI Kommunikation: Agenten koennen Canvas-Inhalte live aktualisieren

---

## Phase 25 - Claude Code Integration

**Prioritat:** Power-Feature

Clara kann Claude Code (Anthropic CLI) als Coding-Backend nutzen — du sagst Clara was du brauchst, sie delegiert die Umsetzung an Claude Code und ueberwacht das Ergebnis.

### Kern-Integration
- [ ] Claude Code als Subprocess starten und steuern (claude CLI via stdin/stdout/JSON)
- [ ] CodingSkill: Clara nimmt Coding-Auftraege entgegen und delegiert an Claude Code
- [ ] Projekt-Kontext uebergeben: Arbeitsverzeichnis, relevante Dateien, CLAUDE.md
- [ ] Streaming-Output von Claude Code in Echtzeit an Clara-UI weiterleiten
- [ ] Ergebnis-Zusammenfassung: Clara fasst die Aenderungen nach Abschluss auf Deutsch zusammen

### Workflow-Steuerung
- [ ] Clara plant den Auftrag (was soll geaendert werden, welche Dateien betroffen)
- [ ] Clara formuliert den Prompt fuer Claude Code basierend auf User-Anfrage
- [ ] Interaktive Rueckfragen: Claude Code Fragen an den User durch Clara durchreichen
- [ ] Abbruch-Moeglichkeit: Laufende Claude Code Session stoppen
- [ ] Multi-Step Workflows: Clara zerlegt grosse Aufgaben in Schritte und fuehrt sie nacheinander aus

### Git-Integration
- [ ] Automatischer Git-Status vor und nach Claude Code Ausfuehrung
- [ ] Diff-Anzeige: Clara zeigt die Aenderungen im Chat (mit Syntax-Highlighting)
- [ ] Auto-Commit Option: Clara committed die Aenderungen mit sinnvoller Message
- [ ] Branch-Management: Clara erstellt Feature-Branches fuer groessere Aufgaben
- [ ] PR-Erstellung: Clara kann Pull Requests via gh CLI anlegen

### Projekt-Verwaltung
- [ ] Projekt-Mapping: Clara kennt deine Projekte und deren Verzeichnisse
- [ ] CLAUDE.md Management: Clara pflegt die CLAUDE.md Dateien deiner Projekte
- [ ] Dependency-Check: Clara prueft nach Aenderungen ob alles noch baut/laeuft
- [ ] Test-Ausfuehrung: Clara laesst Tests laufen und berichtet Ergebnisse
- [ ] Code-Review: Clara kann Code von Claude Code nochmal pruefen lassen

### UI-Features
- [ ] Code-Panel im Web-UI: Live-Ansicht der Claude Code Aktivitaet
- [ ] Datei-Baum: Betroffene Dateien mit Aenderungs-Status anzeigen
- [ ] Inline-Diff-Viewer: Aenderungen direkt im Chat ansehen
- [ ] Terminal-Output: Claude Code Shell-Befehle und deren Output anzeigen
- [ ] Projekt-Switcher: Schnell zwischen Projekten wechseln

### Sicherheit
- [ ] Sandbox-Modus: Claude Code nur in erlaubten Verzeichnissen arbeiten lassen
- [ ] Approval-Flow: Kritische Aktionen (Loeschen, Force-Push) bestaetigen lassen
- [ ] Audit-Log: Alle Claude Code Aktionen protokollieren
- [ ] Rollback: Aenderungen rueckgaengig machen wenn etwas schiefgeht

---

## Empfehlungen fur die Umsetzung

### Phasenbasierte Entwicklung
- Phase 18 (Multi-Provider) ist der groesste Produktivitaets-Boost — Zugriff auf staerkere Modelle
- Phase 20 (Browser) und Phase 12 (erweiterte Tools) machen Clara deutlich nuetzlicher
- Phase 19 (Gateway) bildet die Basis fuer Phase 21 (Sessions) und Phase 22 (Nodes)

### Modularer Aufbau
- Neuer `providers/` Ordner mit Provider-ABC und Implementierungen pro LLM-Anbieter
- `cli/` Ordner mit Click/Typer-basiertem CLI-Framework
- `browser/` Ordner mit Playwright-Wrapper und Browser-Skill
- Bestehende Architektur (BaseSkill, SkillRegistry, ChannelAdapter) als Fundament nutzen

### Prioritaeten fuer Sofort-Nutzen
1. **Phase 18** — Multi-Provider (GPT-4o, Claude fuer komplexe Aufgaben)
2. **Phase 20** — Browser-Automatisierung (Web-Interaktion)
3. **Phase 10** — Telegram/WhatsApp (Mobile Erreichbarkeit)
4. **Phase 15** — Sicherheit (Passwort, Hot-Reload, Doctor)
5. **Phase 23** — CLI (Schnellzugriff ohne Browser)

---

## Phase 26 - Kontext-Management & Kompaktierung

**Prioritat:** Power-Feature

- [ ] /compact Befehl: Manuelle Kontext-Zusammenfassung mit optionalen Anweisungen
- [ ] Auto-Kompaktierung: System-getriggerter Summarize wenn Kontext ans Token-Limit stoesst
- [ ] Memory Flush vor Kompaktierung: Automatische Aufforderung dauerhafte Notizen zu schreiben
- [ ] Kompaktierungs-Zaehler im Session-Status (Anzahl bisheriger Compactions)
- [ ] /context list: Injizierte Dateien und geschaetzte Token-Groessen anzeigen
- [ ] /context detail: Tiefenanalyse nach Datei, Tool-Schema und Skill
- [ ] /usage tokens: Token-Verbrauch an Antworten anhaengen
- [ ] /status: Kontext-Fensterfuellstand und aktuelle Session-Einstellungen anzeigen
- [ ] /think und /verbose als Chat-Direktiven (persistente Session-Einstellungen)
- [ ] /reasoning on|off|stream: Reasoning-Output-Steuerung per Direktive
- [ ] Tool-Output-Groessenbeschraenkung: Grosse Ergebnisse automatisch kuerzen (Anfang + Ende behalten)

---

## Phase 27 - Workspace & Bootstrap-System

**Prioritat:** Power-Feature

- [x] Standardisierte Workspace-Dateien: SOUL.md, IDENTITY.md, TOOLS.md, MEMORY.md (workspace/loader.py, data/agents/<name>/workspace/)
- [x] BOOT.md: Optionale Startup-Checkliste beim Starten (injiziert bei jedem Start)
- [x] Einmaliges Bootstrap-Ritual (BOOTSTRAP.md wird nach ~8 Nachrichten automatisch entfernt)
- [x] Interaktive Ersteinrichtungs-Q&A: Auf Erststart erkannt (0 Nachrichten in DB), BOOTSTRAP.md erstellt
- [x] TOOLS.md: Automatisch aus live SkillRegistry generiert bei jedem Start
- [x] WorkspaceLoader: build_context(), ensure_workspace(), generate_tools_md() (workspace/loader.py)
- [x] Config.AGENTS_WORKSPACE_DIR: Pfad per Env-Var ueberschreibbar (z.B. fuer HDD)
- [ ] USER.md: Nutzer-Praeferenzen als eigene Workspace-Datei (aktuell in MEMORY.md integriert)
- [ ] HEARTBEAT.md: Optionale Prufliste fuer periodische Heartbeat-Runs
- [ ] Multi-Profile-Unterstuetzung via Umgebungsvariable (verschiedene Konfigurationen je Kontext)
- [ ] Workspace als Git-Repo: Backup, Versionierung, Machine-Migration per git clone
- [ ] .gitignore-Empfehlungen fuer Credentials/Secrets im Workspace
- [ ] Per-Datei Token-Limit und globales Token-Cap fuer injizierte Workspace-Dateien (aktuell 100 Zeilen/Datei)
- [ ] Sandbox-Modus: Relative Pfade gegen Workspace aufloesen, absolute Pfade einschraenkbar

---

## Phase 28 - Streaming-Optimierung & Nachrichten-Formatierung

**Prioritat:** Qualitat

- [ ] EmbeddedBlockChunker: Konfigurierbares Low-/High-Bound mit Break-Hierarchie (Absatz → Newline → Satz → Whitespace → Harter Umbruch)
- [ ] Code-Fence-Schutz: Kein Stream-Split innerhalb von Code-Bloecken; Markdown-Gueltigkeit erhalten
- [ ] Koaleszenz: Aufeinanderfolgende Block-Chunks vor dem Senden zusammenfuehren
- [ ] Human-like Pacing: Randomisierte Pausen zwischen Block-Antworten (z.B. 800–2500ms, konfigurierbar)
- [ ] Grenz-Semantik: text_end (sofort streamen) vs. message_end (puffern bis Abschluss)
- [ ] Pro-Kanal Streaming-Steuerung: blockStreaming, textChunkLimit, chunkMode, maxLinesPerMessage
- [ ] Telegram Preview Streaming: Live-Text-Updates waehrend der Generierung (Partial/Block/Off)
- [ ] Reply-Threading: Antworten in Threads verlinken (konfigurierbar per Kanal)

---

## Phase 29 - OAuth & Multi-Account-Auth

**Prioritat:** Produktivitat

- [ ] OAuth-Unterstuetzung fuer LLM-Provider (PKCE-Flow, z.B. OpenAI Codex, Anthropic)
- [ ] Setup-Token-Flow fuer Subscription-basierte Anbieter
- [ ] Automatisches Token-Refresh mit Ablauf-Tracking
- [ ] Token-Sink-Architektur: Simultane Login-Konflikte ueber Plattformen vermeiden
- [ ] Credentials sicher per-Agent gespeichert (auth-profiles.json, isoliert je Agent)
- [ ] Multi-Account: Isolierte Agenten oder Profile-basiertes Routing innerhalb eines Agenten
- [ ] Per-Session Modell-Override via /model @<profileId> Syntax
- [ ] Interaktiver Login-Wizard (onboard-Befehl fur Ersteinrichtung)
- [ ] Manuelles Token-Pasten fuer Remote/Headless-Setups ohne Browser
- [ ] Profil-Status-Verifizierung und Profil-Discovery (models status, channels list)

---

## Phase 30 - Plugin & Hook-System

**Prioritat:** Nice-to-have

- [ ] Plugin-Hooks: before_model_resolve, before_prompt_build, before_tool_call, after_tool_call
- [ ] Session-Grenz-Hooks: on_session_start, on_session_end, on_compaction
- [ ] Agent-Bootstrap-Hook (agent:bootstrap Interceptor)
- [ ] Command-Lifecycle-Interception: Eigene Slash-Commands als Plugins registrieren
- [ ] Plugin-basierte Provider: Eigene OAuth- oder API-Key-Implementierungen
- [ ] Snapshot-Tool: Accessibility-Tree oder KI-generierte Seitenbeschreibungen erfassen
- [ ] Gateway-Tool: Gateway-Prozess via Tool neu starten / aktualisieren
- [ ] Plugin-Marketplace: Skills/Hooks aus Community-Repository installieren (clawhub-Aequivalent)

---

## Phase 31 - Formales Sicherheitsmodell & Externe Secrets-Verwaltung

**Prioritat:** Qualitat
**Inspiriert von:** OpenClaw v2026.2.23 (34 Security-Commits) + v2026.2.26 (External Secrets)

- [ ] Externes Secrets-Management: Secrets aus Vault, Env-Variablen oder Datei-Providern laden
- [ ] Secrets-Schicht-System: Lokale Overrides ueberschreiben globale Defaults (keine Hardcoded-Werte)
- [ ] secrets.json mit strukturierter Platzhalter-Validierung (Zod-Schema-Aequivalent fuer Python: Pydantic)
- [ ] Formales Sicherheitsmodell: Dokumentiertes Bedrohungsmodell (STRIDE) und Absicherungsschichten
- [ ] Docker-Sandbox-Isolation: Tool-Ausfuehrung in isolierten Containern mit konfigurierbaren Scopes
- [ ] Tool-Richtlinien-Stack: Profile → Global → Provider → Agent → Sandbox (5-Ebenen-Vererbung)
- [ ] Prompt-Injection-Abwehr: Eingabe-Bereinigung, Sandbox-Grenzen, Nutzerwarnung bei Verdacht
- [ ] Geraete-Trust-Levels: Vertrauensstufen (Owner, Trusted, Restricted, Blocked) fuer gekoppelte Nodes
- [ ] Secret-Rotation: API-Keys automatisch erneuern und alte invalidieren
- [ ] Sensitive-Data-Redaction: Secrets aus Logs und Tool-Outputs herausfiltern

---

## Phase 32 - Agent Communication Protocol (ACP)

**Prioritat:** Power-Feature
**Inspiriert von:** OpenClaw v2026.2.26 (ACP/Thread-bound Agents als First-Class Runtimes)

- [ ] ACP-Runtime: Thread-gebundene Agenten als vollwertige, isolierte Laufzeitumgebung
- [ ] ACP-Threads: Strukturierte Message-Threads fuer Agent-zu-Agent-Kommunikation
- [ ] CLI Agent-Binding: `clara agent bind <channelId> <agentId>` und `unbind` Befehle
- [ ] ACP-Schema-Validierung: Pydantic-Schema fuer alle ACP-Nachrichten (keine freien Dicts)
- [ ] ACP-Event-Stream: Echtzeit-Updates fuer Agent-Zustandsaenderungen via WebSocket
- [ ] Thread-Persistenz: ACP-Threads in DB speichern und nach Neustart wiederherstellen
- [ ] Thread-Isolation: Jeder Thread hat eigenen Kontext, kein Kontext-Leak zwischen Threads
- [ ] ACP-Broadcast: Eine Nachricht an mehrere Agenten gleichzeitig senden
- [ ] ACP-Routing: Eingehende Nachrichten automatisch an den zustaendigen Thread-Agenten leiten
- [ ] Thread-Archivierung: Abgeschlossene Threads komprimieren und langfristig aufbewahren

---

## Phase 33 - Computer-Use & Agent Harness

**Prioritat:** Produktivitat
**Inspiriert von:** OpenClaw VISION.md (Computer-Use und Agent Harness als naechste Prioritaet)

- [ ] Computer-Use Skill: Maus- und Tastatur-Steuerung via pyautogui/pynput
- [ ] Screen-Understanding: Aktuelle Bildschirminhalte analysieren und strukturiert beschreiben
- [ ] Application-Launcher: Anwendungen starten, Fenster verwalten, Fokus setzen
- [ ] Clipboard-Pipeline: Bidirektionaler Clipboard-Workflow (Lesen → KI-Verarbeitung → Schreiben)
- [ ] Accessibility-Tree Capture: UI-Elemente per Accessibility-API erkennen (pywinauto/AT-SPI)
- [ ] Agent-Harness: Strukturierter Ausfuehrungsrahmen fuer komplexe mehrstufige Desktop-Aufgaben
- [ ] Loop-Safe Execution: Automatische Loop-Detection mit konfigurierbarem Abbruch nach N Iterationen
- [ ] Human-in-the-Loop: Bestaetigungsdialoge fuer riskante Desktop-Aktionen (Datei loeschen etc.)
- [ ] Action-Replay: Aufgezeichnete Aktionssequenzen wiederholen (Makro-Recorder)
- [ ] Cross-Platform-Support: Windows (pyautogui), Linux (xdotool), macOS (AppleScript/cliclick)

---

## Phase 34 - Community Skill Registry (Clara Skills Hub)

**Prioritat:** Nice-to-have
**Inspiriert von:** OpenClaw ClawHub (5.700+ Community-Skills per Feb 2026)

- [ ] Skill-Paketformat: Standardisiertes Format (name, version, author, dependencies, execute)
- [ ] `clara skills install <name>`: Skill aus Registry per Name installieren
- [ ] `clara skills list`: Verfuegbare Community-Skills mit Beschreibung und Bewertung durchsuchen
- [ ] `clara skills publish`: Eigene Skills als Paket veroeffentlichen
- [ ] `clara skills update`: Alle installierten Skills auf neueste Version aktualisieren
- [ ] `clara skills remove <name>`: Skill deinstallieren und Dateien bereinigen
- [ ] Skill-Signierung: Kryptographische Signatur (Ed25519) fuer vertrauenswuerdige Skills
- [ ] Skill-Sandboxing: Community-Skills in isolierter Umgebung (venv oder Docker) ausfuehren
- [ ] Skill-Versionierung: Kompatibilitaets-Matrix (Skill-Version vs. Clara-Version)
- [ ] Registry-Mirror: Lokaler Cache der Registry fuer Offline-Betrieb
- [ ] Skill-Bewertungen und Reviews: Community-Feedback fuer Qualitaetssicherung
- [ ] Auto-Discovery: Clara erkennt lokal installierte Skill-Pakete automatisch beim Start

---

## Phase 35 - Performance & Test-Infrastruktur

**Prioritat:** Qualitat
**Inspiriert von:** OpenClaw VISION.md (Performance und Test Infrastructure als naechste Prioritaet)

- [ ] Test-Suite: pytest-basierte Unit- und Integrationstests fuer alle Core-Module
- [ ] Coverage-Tracking: Mindest-Coverage-Schwelle 70% (pytest-cov), Report bei jedem Push
- [ ] CI/CD Pipeline: GitHub Actions fuer automatische Tests, Linting und Type-Checking bei Push/PR
- [ ] Load-Testing: Stress-Tests fuer WebSocket-Verbindungen und LLM-Pipeline (locust)
- [ ] Performance-Profiling: Latenz-Metriken pro Skill und LLM-Call (py-spy / cProfile)
- [ ] Memory-Leak-Detection: Async-Ressourcen-Tracking mit tracemalloc
- [ ] Benchmark-Suite: Standardisierte Performance-Baselines (Response-Zeit, Token/s, Tool-Latenz)
- [ ] Type-Checking: mypy oder pyright fuer statische Typ-Sicherheit im gesamten Codebase
- [ ] Linting: ruff als schneller Ersatz fuer flake8/pylint
- [ ] Pre-Commit Hooks: Automatische Formatierung (black/ruff) und Tests vor jedem Commit
- [ ] Dependency-Scanning: Automatische Pruefung auf bekannte Sicherheitsluecken in Abhaengigkeiten
- [ ] Canary-Releases: Schrittweise Rollouts neuer Versionen an Subset der Instanzen

