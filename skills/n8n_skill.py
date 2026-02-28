import json
import logging
import aiohttp
from config import Config
from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class N8nSkill(BaseSkill):
    """Manages n8n workflows: list, create, activate/deactivate, execute, delete."""

    def _headers(self) -> dict:
        return {
            "X-N8N-API-KEY": Config.N8N_API_KEY,
            "Content-Type": "application/json",
        }

    def _url(self, path: str) -> str:
        return f"{Config.N8N_BASE_URL.rstrip('/')}/api/v1/{path.lstrip('/')}"

    @property
    def name(self) -> str:
        return "n8n"

    @property
    def description(self) -> str:
        return (
            "Verwaltet n8n-Workflows: auflisten, erstellen (aus JSON), aktivieren, "
            "deaktivieren, loeschen und ausfuehren. "
            "Nutze 'create', um neue Automatisierungen bereitzustellen."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "list",
                        "create",
                        "activate",
                        "deactivate",
                        "delete",
                        "execute",
                        "get_execution",
                    ],
                    "description": (
                        "Aktion: list=alle Workflows anzeigen, "
                        "create=neuen Workflow erstellen (workflow_json erforderlich), "
                        "activate/deactivate=Workflow ein-/ausschalten (workflow_id), "
                        "delete=Workflow loeschen (workflow_id), "
                        "execute=Workflow manuell ausfuehren (workflow_id), "
                        "get_execution=Ergebnis einer Ausfuehrung abrufen (execution_id)"
                    ),
                },
                "workflow_id": {
                    "type": "string",
                    "description": "n8n Workflow-ID (fuer activate/deactivate/delete/execute)",
                },
                "execution_id": {
                    "type": "string",
                    "description": "n8n Execution-ID (fuer get_execution)",
                },
                "workflow_json": {
                    "type": "string",
                    "description": (
                        "Vollstaendiger n8n-Workflow als JSON-String (fuer create). "
                        "Muss 'name' und 'nodes' enthalten."
                    ),
                },
            },
            "required": ["action"],
        }

    async def execute(
        self,
        action: str,
        workflow_id: str = "",
        execution_id: str = "",
        workflow_json: str = "",
        **kwargs,
    ) -> str:
        if not Config.N8N_BASE_URL or not Config.N8N_API_KEY:
            return (
                "n8n ist nicht konfiguriert. "
                "Bitte N8N_BASE_URL und N8N_API_KEY in der .env setzen."
            )

        try:
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(
                headers=self._headers(), timeout=timeout
            ) as session:
                if action == "list":
                    return await self._list(session)
                elif action == "create":
                    return await self._create(session, workflow_json)
                elif action == "activate":
                    return await self._set_active(session, workflow_id, active=True)
                elif action == "deactivate":
                    return await self._set_active(session, workflow_id, active=False)
                elif action == "delete":
                    return await self._delete(session, workflow_id)
                elif action == "execute":
                    return await self._execute(session, workflow_id)
                elif action == "get_execution":
                    return await self._get_execution(session, execution_id)
                else:
                    return f"Unbekannte Aktion: {action}"

        except aiohttp.ClientConnectorError:
            return (
                f"Verbindung zu n8n fehlgeschlagen ({Config.N8N_BASE_URL}). "
                "Laeuft der n8n-Container?"
            )
        except Exception as e:
            logger.exception("n8n_skill error")
            return f"n8n-Fehler: {e}"

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _list(self, session: aiohttp.ClientSession) -> str:
        async with session.get(self._url("workflows")) as resp:
            resp.raise_for_status()
            data = await resp.json()

        workflows = data.get("data", [])
        if not workflows:
            return "Keine Workflows vorhanden."

        lines = []
        for w in workflows:
            status = "aktiv" if w.get("active") else "inaktiv"
            lines.append(f"- **{w['name']}** (ID: `{w['id']}`) — {status}")
        return f"n8n-Workflows ({len(workflows)}):\n" + "\n".join(lines)

    async def _create(self, session: aiohttp.ClientSession, workflow_json: str) -> str:
        if not workflow_json.strip():
            return "Fehler: 'workflow_json' ist leer."

        try:
            payload = json.loads(workflow_json)
        except json.JSONDecodeError as e:
            return f"Fehler: workflow_json ist kein gueltiges JSON — {e}"

        # n8n requires at least name and nodes
        if "name" not in payload:
            return "Fehler: workflow_json muss ein 'name'-Feld enthalten."
        if "nodes" not in payload:
            return "Fehler: workflow_json muss ein 'nodes'-Array enthalten."

        # Strip 'id' so n8n assigns a fresh one
        payload.pop("id", None)

        # Newly created workflows start inactive — user activates after review
        payload["active"] = False

        async with session.post(self._url("workflows"), json=payload) as resp:
            if not resp.ok:
                body = await resp.text()
                return (
                    f"n8n API Fehler {resp.status} beim Erstellen des Workflows.\n"
                    f"Details: {body[:500]}\n\n"
                    f"Haeufige Ursachen:\n"
                    f"- Falscher Node-Typ (muss 'n8n-nodes-base.TYPE' sein, nicht 'trigger')\n"
                    f"- Fehlende Pflichtfelder in Node-Parametern\n"
                    f"- Ungueltige Verbindungen zwischen Nodes"
                )
            created = await resp.json()

        wf_id = created.get("id", "?")
        wf_name = created.get("name", "?")
        return (
            f"Workflow **{wf_name}** erstellt (ID: `{wf_id}`).\n"
            f"Status: inaktiv — bitte in n8n pruefen und dann aktivieren:\n"
            f"  n8n-Skill: action=activate, workflow_id={wf_id}\n"
            f"  oder direkt im UI: {Config.N8N_BASE_URL}/workflow/{wf_id}"
        )

    async def _set_active(
        self, session: aiohttp.ClientSession, workflow_id: str, active: bool
    ) -> str:
        if not workflow_id:
            return "Fehler: 'workflow_id' erforderlich."

        endpoint = "activate" if active else "deactivate"
        async with session.post(self._url(f"workflows/{workflow_id}/{endpoint}")) as resp:
            resp.raise_for_status()
            data = await resp.json()

        name = data.get("name", workflow_id)
        status = "aktiviert" if active else "deaktiviert"
        return f"Workflow **{name}** erfolgreich {status}."

    async def _delete(self, session: aiohttp.ClientSession, workflow_id: str) -> str:
        if not workflow_id:
            return "Fehler: 'workflow_id' erforderlich."

        async with session.delete(self._url(f"workflows/{workflow_id}")) as resp:
            resp.raise_for_status()

        return f"Workflow `{workflow_id}` geloescht."

    async def _execute(self, session: aiohttp.ClientSession, workflow_id: str) -> str:
        if not workflow_id:
            return "Fehler: 'workflow_id' erforderlich."

        async with session.post(self._url(f"workflows/{workflow_id}/run")) as resp:
            resp.raise_for_status()
            data = await resp.json()

        exec_id = data.get("data", {}).get("executionId", "?")
        return (
            f"Workflow `{workflow_id}` gestartet.\n"
            f"Execution-ID: `{exec_id}`\n"
            f"Ergebnis abrufen: action=get_execution, execution_id={exec_id}"
        )

    async def _get_execution(
        self, session: aiohttp.ClientSession, execution_id: str
    ) -> str:
        if not execution_id:
            return "Fehler: 'execution_id' erforderlich."

        async with session.get(self._url(f"executions/{execution_id}")) as resp:
            resp.raise_for_status()
            data = await resp.json()

        status = data.get("status", "unknown")
        finished = data.get("finished", False)
        started = data.get("startedAt", "?")
        stopped = data.get("stoppedAt", "?")

        lines = [
            f"Execution `{execution_id}`:",
            f"  Status    : {status}",
            f"  Abgeschl. : {finished}",
            f"  Gestartet : {started}",
            f"  Beendet   : {stopped}",
        ]

        # Include output data of the last node if available
        result_data = data.get("data", {}).get("resultData", {})
        run_data = result_data.get("runData", {})
        if run_data:
            last_node = list(run_data.keys())[-1]
            node_output = run_data[last_node]
            try:
                output_str = json.dumps(node_output, ensure_ascii=False, indent=2)
                if len(output_str) > 800:
                    output_str = output_str[:800] + "\n... (gekuerzt)"
                lines.append(f"\nLetzter Knoten ({last_node}) Output:\n{output_str}")
            except Exception:
                pass

        return "\n".join(lines)
