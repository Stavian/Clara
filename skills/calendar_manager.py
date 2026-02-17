import asyncio
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _get_credentials(credentials_path: Path, token_path: Path):
    """Load or create Google Calendar API credentials (blocking)."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not credentials_path.exists():
                raise FileNotFoundError(
                    f"Google OAuth credentials nicht gefunden: {credentials_path}\n"
                    "Bitte 'credentials.json' von der Google Cloud Console herunterladen "
                    "und in data/ ablegen."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.write_text(creds.to_json())

    return creds


def _build_service(credentials_path: Path, token_path: Path):
    """Build Google Calendar API service (blocking)."""
    from googleapiclient.discovery import build

    creds = _get_credentials(credentials_path, token_path)
    return build("calendar", "v3", credentials=creds)


class CalendarManagerSkill(BaseSkill):
    def __init__(self):
        base_dir = Path(__file__).resolve().parent.parent
        self._credentials_path = base_dir / "data" / "credentials.json"
        self._token_path = base_dir / "data" / "google_token.json"
        self._calendar_id = os.getenv("GOOGLE_CALENDAR_ID", "primary")

    @property
    def name(self) -> str:
        return "calendar_manager"

    @property
    def description(self) -> str:
        return (
            "Verwaltet Google Kalender-Eintraege. Kann Termine erstellen, "
            "auflisten, loeschen und suchen."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add_event", "list_events", "delete_event", "today", "upcoming", "search"],
                    "description": (
                        "'add_event' erstellt einen Termin, 'list_events' listet Termine auf, "
                        "'delete_event' loescht einen Termin, 'today' zeigt heutige Termine, "
                        "'upcoming' zeigt kommende Termine, 'search' sucht nach Terminen."
                    ),
                },
                "title": {
                    "type": "string",
                    "description": "Titel des Termins. Fuer 'add_event'.",
                },
                "description": {
                    "type": "string",
                    "description": "Beschreibung des Termins. Fuer 'add_event'.",
                },
                "start": {
                    "type": "string",
                    "description": "Startzeit im Format 'YYYY-MM-DD HH:MM' oder 'YYYY-MM-DD'. Fuer 'add_event'.",
                },
                "end": {
                    "type": "string",
                    "description": "Endzeit im Format 'YYYY-MM-DD HH:MM' oder 'YYYY-MM-DD'. Fuer 'add_event'. Ohne Angabe: 1 Stunde nach Start.",
                },
                "location": {
                    "type": "string",
                    "description": "Ort des Termins. Fuer 'add_event'.",
                },
                "days_ahead": {
                    "type": "integer",
                    "description": "Anzahl Tage voraus fuer 'upcoming' (Standard: 7).",
                },
                "event_id": {
                    "type": "string",
                    "description": "ID des Termins. Fuer 'delete_event'.",
                },
                "query": {
                    "type": "string",
                    "description": "Suchbegriff fuer 'search'.",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str, **kwargs) -> str:
        try:
            loop = asyncio.get_event_loop()

            if action == "add_event":
                return await loop.run_in_executor(None, self._add_event, kwargs)
            elif action == "delete_event":
                event_id = kwargs.get("event_id", "")
                if not event_id:
                    return "Fehler: 'event_id' ist erforderlich."
                return await loop.run_in_executor(None, self._delete_event, event_id)
            elif action == "today":
                return await loop.run_in_executor(None, self._list_today)
            elif action == "upcoming":
                days = kwargs.get("days_ahead", 7)
                return await loop.run_in_executor(None, self._list_upcoming, days)
            elif action == "search":
                query = kwargs.get("query", "")
                if not query:
                    return "Fehler: 'query' ist erforderlich."
                return await loop.run_in_executor(None, self._search_events, query)
            elif action == "list_events":
                days = kwargs.get("days_ahead", 30)
                return await loop.run_in_executor(None, self._list_upcoming, days)
            else:
                return f"Unbekannte Aktion: {action}"
        except FileNotFoundError as e:
            return str(e)
        except Exception as e:
            logger.exception("Calendar operation failed")
            return f"Fehler bei Kalender-Operation: {e}"

    def _get_service(self):
        return _build_service(self._credentials_path, self._token_path)

    def _add_event(self, kwargs: dict) -> str:
        title = kwargs.get("title", "")
        if not title:
            return "Fehler: 'title' ist erforderlich."
        start_str = kwargs.get("start", "")
        if not start_str:
            return "Fehler: 'start' ist erforderlich."

        # Parse start time
        start_dt, is_date_only = self._parse_datetime(start_str)

        # Parse end time
        end_str = kwargs.get("end", "")
        if end_str:
            end_dt, _ = self._parse_datetime(end_str)
        elif is_date_only:
            end_dt = start_dt + timedelta(days=1)
        else:
            end_dt = start_dt + timedelta(hours=1)

        event_body = {"summary": title}

        if kwargs.get("description"):
            event_body["description"] = kwargs["description"]
        if kwargs.get("location"):
            event_body["location"] = kwargs["location"]

        if is_date_only:
            event_body["start"] = {"date": start_dt.strftime("%Y-%m-%d")}
            event_body["end"] = {"date": end_dt.strftime("%Y-%m-%d")}
        else:
            event_body["start"] = {"dateTime": start_dt.isoformat(), "timeZone": "Europe/Berlin"}
            event_body["end"] = {"dateTime": end_dt.isoformat(), "timeZone": "Europe/Berlin"}

        service = self._get_service()
        event = service.events().insert(calendarId=self._calendar_id, body=event_body).execute()

        return (
            f"Termin erstellt: **{title}**\n"
            f"- Start: {start_str}\n"
            f"- Ende: {end_str or 'automatisch'}\n"
            f"- ID: `{event['id']}`"
        )

    def _delete_event(self, event_id: str) -> str:
        service = self._get_service()
        service.events().delete(calendarId=self._calendar_id, eventId=event_id).execute()
        return f"Termin geloescht (ID: {event_id})."

    def _list_today(self) -> str:
        now = datetime.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
        return self._fetch_events(
            start_of_day.isoformat() + "Z",
            end_of_day.isoformat() + "Z",
            "Heutige Termine",
        )

    def _list_upcoming(self, days: int) -> str:
        now = datetime.now()
        end = now + timedelta(days=days)
        return self._fetch_events(
            now.isoformat() + "Z",
            end.isoformat() + "Z",
            f"Termine der naechsten {days} Tage",
        )

    def _search_events(self, query: str) -> str:
        service = self._get_service()
        now = datetime.now().isoformat() + "Z"
        result = (
            service.events()
            .list(
                calendarId=self._calendar_id,
                timeMin=now,
                maxResults=20,
                singleEvents=True,
                orderBy="startTime",
                q=query,
            )
            .execute()
        )
        events = result.get("items", [])
        if not events:
            return f"Keine Termine gefunden fuer '{query}'."
        return self._format_events(f"Suchergebnisse fuer '{query}'", events)

    def _fetch_events(self, time_min: str, time_max: str, header: str) -> str:
        service = self._get_service()
        result = (
            service.events()
            .list(
                calendarId=self._calendar_id,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=50,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )
        events = result.get("items", [])
        if not events:
            return f"**{header}:** Keine Termine."
        return self._format_events(header, events)

    @staticmethod
    def _format_events(header: str, events: list) -> str:
        lines = [f"**{header}** ({len(events)} Termine):"]
        for ev in events:
            start = ev.get("start", {})
            dt_str = start.get("dateTime", start.get("date", "?"))
            # Simplify ISO datetime for display
            if "T" in dt_str:
                try:
                    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                    dt_str = dt.strftime("%d.%m.%Y %H:%M")
                except ValueError:
                    pass
            summary = ev.get("summary", "(Kein Titel)")
            location = ev.get("location", "")
            line = f"- **{summary}** — {dt_str}"
            if location:
                line += f" ({location})"
            line += f" `ID:{ev['id']}`"
            lines.append(line)
        return "\n".join(lines)

    @staticmethod
    def _parse_datetime(dt_str: str) -> tuple[datetime, bool]:
        """Parse a datetime string, returns (datetime, is_date_only)."""
        dt_str = dt_str.strip()
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%d.%m.%Y %H:%M"):
            try:
                return datetime.strptime(dt_str, fmt), False
            except ValueError:
                continue
        for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
            try:
                return datetime.strptime(dt_str, fmt), True
            except ValueError:
                continue
        raise ValueError(f"Datumsformat nicht erkannt: '{dt_str}'. Erwartet: 'YYYY-MM-DD HH:MM' oder 'YYYY-MM-DD'.")
