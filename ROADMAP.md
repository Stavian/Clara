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
| 15 | Sicherheit & Stabilitat | Qualitat | Teilweise |
| 16 | Voice & Multimedia | Qualitat | Teilweise |
| 17 | Externe Integrationen | Nice-to-have | Offen |

---

## Phase 9 - Erweiterte Memory-Systeme

**Prioritat:** Sofort nutzlich

- [x] Automatische Extraktion von Fakten uber den Nutzer (memory/fact_extractor.py)
- [x] Session-Zusammenfassung und Kontext-Priorisierung (memory/context_builder.py, neuere Erinnerungen starker gewichtet)
- [x] Memory-Management Skill fur Durchsuchung und Bearbeitung von Erinnerungen (skills/memory_manager.py)

---

## Phase 10 - Multi-Channel Messaging

**Prioritat:** Sofort nutzlich

- [ ] Integration von Telegram als Kommunikationskanal
- [x] Integration von Discord als Kommunikationskanal (discord_bot/, ChannelAdapter-Abstraktion)
- [ ] Integration von WhatsApp als Kommunikationskanal
- [x] Einheitliches Session-Management uber alle Kanale (ChatEngine + ChannelAdapter in chat/)
- [x] Berechtigungssystem: Owner vs. oeffentliche Skills per User-ID
- [x] Proaktive Benachrichtigungen und Kanal-Router (notifications/notification_service.py)

---

## Phase 11 - Automatisierung & Skripte

**Prioritat:** Produktivitat

- [x] Cron-Jobs (TaskSchedulerSkill + SchedulerEngine)
- [x] Heartbeat-Checks (Heartbeat-System mit konfigurierbarem Intervall)
- [x] Webhook-Empfanger (webhook/ mit Token-Auth, WebhookManagerSkill)
- [x] Automatische Aktionen basierend auf Ereignissen (automation/ mit EventBus + AutomationEngine)
- [x] Batch-Skript-Ausfuhrung (scripts/script_engine.py, BatchScriptSkill)
- [x] Proaktive Benachrichtigungen (notifications/notification_service.py, Web + Discord)

---

## Phase 12 - Erweiterte Skills & Tools

**Prioritat:** Produktivitat

- [x] Screenshot-Skill (ScreenshotSkill mit mss, Full/Monitor/Region)
- [x] Clipboard-Skill (ClipboardSkill mit pyperclip, Read/Write)
- [ ] Browser-Automatisierung (Playwright/Selenium) — Basis vorhanden: WebBrowseSkill + WebFetchSkill
- [ ] E-Mail-Integration
- [x] PDF-Dokumenten-Verarbeitung (PDFReaderSkill mit pdfplumber, Text/Tabellen/Info)
- [x] Code-Ausfuhrung (lokal) (SystemCommandSkill)
- [x] Bild-Verarbeitung (lokal) (ImageGenerationSkill mit Stable Diffusion)
- [ ] Audio-Verarbeitung (lokal)
- [x] Rechnerfunktionen (CalculatorSkill mit sicherer AST-Auswertung, Einheitenumrechnung)
- [x] Kalender-Integration (CalendarManagerSkill mit Google Calendar API)

---

## Phase 13 - Agent-System

**Prioritat:** Power-Feature

- [x] Personas/Agenten fur verschiedene Aufgaben (general, coding, research, image_prompt)
- [x] Agent-Workspace mit individueller Konfiguration (eigenes Modell, System-Prompt, Skills pro Agent)
- [x] Sub-Agenten fur effiziente Aufgabenverteilung (AgentRouter mit delegate_to_agent Tool)
- [x] Agent-Templates (YAML-basiert in data/agent_templates/, AgentManagerSkill fuer CRUD)

---

## Phase 14 - Erweiterte UI

**Prioritat:** Power-Feature

- [x] Dashboard mit System-Status (Ollama/SD/Discord Status, Statistiken, Aktivitaet, Skills, Agenten, Jobs)
- [x] Projekt-Ubersicht (Projekte-View mit Karten, Status-Badges, Fortschrittsbalken, CRUD)
- [x] Aufgaben-Verwaltung (Task-Panel pro Projekt, Status-Cycling, Prioritaeten, Erstellen/Loeschen)
- [x] Speicherverbrauch-Anzeige (Dashboard-Sektion mit Balkendiagramm, Speicher nach Kategorie)
- [x] Settings-Seite (Modell-Browser, Gedaechtnis-Verwaltung, Agenten-Vorlagen, Systeminfo)
- [ ] Slash-Commands
- [x] Datei-Upload (Bild-Upload mit Vorschau und Clipboard-Paste)
- [ ] Code-Highlighting
- [x] Dark/Light-Theme (Gemini-inspiriertes Dark Theme mit Blue-Accent)
- [x] Mobile-Optimierung (responsive Layout, Dashboard-Grid-Anpassung)

---

## Phase 15 - Sicherheit & Stabilitat

**Prioritat:** Qualitat

- [ ] Passwort-Schutz
- [ ] Audit-Log
- [ ] Tool-Richtlinien
- [ ] Automatische Backups
- [x] Health-Check-Endpunkt (/api/health mit Ollama-Status)
- [ ] Graceful Error Recovery
- [ ] Rate Limiting
- [ ] Clara Doctor (Selbstdiagnose-Tool)

---

## Phase 16 - Voice & Multimedia

**Prioritat:** Qualitat

- [ ] Spracheingabe (Speech-to-Text)
- [x] Sprachausgabe (TTS) (edge-tts mit de-DE-KatjaNeural, Toggle-Button im UI)
- [ ] Wake Word "Hey Clara"
- [x] Bild-Upload (Bilder an Clara senden zur Analyse, Clipboard-Paste)
- [ ] Kamera-Zugriff

---

## Phase 17 - Externe Integrationen

**Prioritat:** Nice-to-have

- [ ] Plugin-System fur benutzerdefinierte Skills
- [ ] Git-Integration
- [ ] RSS/News-Feed
- [ ] Smart Home Integration
- [ ] Spotify Integration
- [ ] Wetter-Skill

---

## Empfehlungen fur die Umsetzung

### Phasenbasierte Entwicklung
- Starte mit Phase 9 (Memory) und Phase 10 (Telegram-Bot) als Grundlage
- Phase 11 (Automatisierung) und Phase 12 (Skills) fur Produktivitat nachziehen

### Modularer Aufbau
- Features pro Phase als eigenstandiges Modul implementieren
- Memory-Manager-Skill (Phase 9) als zentrales Verwaltungstool

### Sicherheit fruh priorisieren
- Passwort-Schutz und Audit-Log (Phase 15) nicht zu spat einplanen
- Clara Doctor fur regelmaessige Systemchecks nutzen
