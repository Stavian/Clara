# Clara - Roadmap

## Phasen-Ubersicht

| Phase | Bereich | Prioritat | Status |
|-------|---------|-----------|--------|
| 9 | Erweiterte Memory-Systeme | Sofort nutzlich | Fertig |
| 10 | Multi-Channel Messaging | Sofort nutzlich | Offen |
| 11 | Automatisierung & Skripte | Produktivitat | Teilweise |
| 12 | Erweiterte Skills & Tools | Produktivitat | Teilweise |
| 13 | Agent-System | Power-Feature | Fertig |
| 14 | Erweiterte UI | Power-Feature | Offen |
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
- [ ] Proaktive Benachrichtigungen und Kanal-Router

---

## Phase 11 - Automatisierung & Skripte

**Prioritat:** Produktivitat

- [x] Cron-Jobs (TaskSchedulerSkill + SchedulerEngine)
- [x] Heartbeat-Checks (Heartbeat-System mit konfigurierbarem Intervall)
- [ ] Webhook-Empfanger
- [ ] Automatische Aktionen basierend auf Ereignissen
- [ ] Batch-Skript-Ausfuhrung
- [ ] Proaktive Benachrichtigungen

---

## Phase 12 - Erweiterte Skills & Tools

**Prioritat:** Produktivitat

- [ ] Screenshot-Skill
- [ ] Clipboard-Skill
- [ ] Browser-Automatisierung (Playwright/Selenium) — Basis vorhanden: WebBrowseSkill + WebFetchSkill
- [ ] E-Mail-Integration
- [ ] PDF-Dokumenten-Verarbeitung
- [x] Code-Ausfuhrung (lokal) (SystemCommandSkill)
- [x] Bild-Verarbeitung (lokal) (ImageGenerationSkill mit Stable Diffusion)
- [ ] Audio-Verarbeitung (lokal)
- [ ] Rechnerfunktionen
- [ ] Kalender-Integration

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

- [ ] Dashboard mit System-Status
- [ ] Projekt-Ubersicht
- [ ] Aufgaben-Verwaltung
- [ ] Speicherverbrauch-Anzeige
- [ ] Settings-Seite (Modell-Wechsel, Skills-Management, Verzeichnis-Konfiguration)
- [ ] Slash-Commands
- [ ] Datei-Upload
- [ ] Code-Highlighting
- [ ] Dark/Light-Theme
- [ ] Mobile-Optimierung

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
