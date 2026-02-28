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
                        "list_clara_tools",
                        "create",
                        "create_tool",
                        "run_tool",
                        "activate",
                        "deactivate",
                        "delete",
                        "execute",
                        "get_execution",
                    ],
                    "description": (
                        "Aktion: list=alle Workflows anzeigen, "
                        "list_clara_tools=nur Clara-Tools (Tag 'clara') anzeigen, "
                        "create=neuen Workflow erstellen (workflow_json erforderlich), "
                        "create_tool=neuen Workflow aus Beschreibung erstellen und als Clara-Tool taggen (description erforderlich), "
                        "run_tool=Clara-Tool per Name ausfuehren (workflow_name erforderlich, input_data optional), "
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
                "description": {
                    "type": "string",
                    "description": (
                        "Natuerlichsprachliche Beschreibung des gewuenschten Workflows auf Englisch "
                        "(fuer create_tool). Beispiel: 'Every weekday at 9 AM fetch weather and post to Discord'."
                    ),
                },
                "requirements": {
                    "type": "string",
                    "description": (
                        "Optionale technische Anforderungen fuer create_tool: "
                        "z.B. Webhook-Pfade, API-URLs, Feldnamen, Zeitplaene."
                    ),
                },
                "workflow_name": {
                    "type": "string",
                    "description": (
                        "Name (oder Teil des Namens) eines Clara-Tools fuer run_tool. "
                        "Gross-/Kleinschreibung egal. Beispiel: 'Wetter-Check'."
                    ),
                },
                "input_data": {
                    "type": "string",
                    "description": (
                        "Optionaler JSON-String mit Input-Daten fuer run_tool, "
                        "falls der Workflow einen Webhook-Trigger hat. "
                        "Beispiel: '{\"message\": \"Hallo\", \"channel\": \"general\"}'."
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
        description: str = "",
        requirements: str = "",
        workflow_name: str = "",
        input_data: str = "",
        **kwargs,
    ) -> str:
        if not Config.N8N_BASE_URL or not Config.N8N_API_KEY:
            return (
                "n8n ist nicht konfiguriert. "
                "Bitte N8N_BASE_URL und N8N_API_KEY in der .env setzen."
            )

        # create_tool uses its own session (webhook, no API key header needed)
        if action == "create_tool":
            return await self._create_tool(description, requirements)

        try:
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(
                headers=self._headers(), timeout=timeout
            ) as session:
                if action == "list":
                    return await self._list(session)
                elif action == "list_clara_tools":
                    return await self._list_clara_tools(session)
                elif action == "run_tool":
                    return await self._run_tool(session, workflow_name, input_data)
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

    async def _create_tool(self, description: str, requirements: str) -> str:
        """POST to the n8n creator webhook — workflow is built and deployed by n8n itself."""
        if not description.strip():
            return "Fehler: 'description' ist erforderlich fuer create_tool."

        webhook_url = Config.N8N_CREATOR_WEBHOOK
        if not webhook_url:
            return (
                "N8N_CREATOR_WEBHOOK ist nicht konfiguriert. "
                "Bitte die URL des Creator-Workflows in der .env setzen."
            )

        payload: dict = {"description": description.strip()}
        if requirements.strip():
            payload["requirements"] = requirements.strip()

        try:
            timeout = aiohttp.ClientTimeout(total=120)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(webhook_url, json=payload) as resp:
                    body = await resp.text()
                    if not resp.ok:
                        return (
                            f"Creator-Webhook Fehler {resp.status}.\n"
                            f"URL: {webhook_url}\n"
                            f"Details: {body[:400]}"
                        )
                    try:
                        data = json.loads(body)
                    except json.JSONDecodeError:
                        return f"Creator-Webhook Antwort (kein JSON):\n{body[:600]}"

        except aiohttp.ClientConnectorError:
            return (
                f"Verbindung zum Creator-Webhook fehlgeschlagen.\n"
                f"URL: {webhook_url}\n"
                "Ist der Workflow in n8n aktiv?"
            )

        wf_id = data.get("id", "")
        wf_name = data.get("name", "")
        wf_url = data.get("url", f"{Config.N8N_BASE_URL}/workflow/{wf_id}" if wf_id else "")
        error = data.get("error", "")

        if error:
            return f"Creator-Workflow meldet Fehler: {error}"
        if not wf_id:
            return f"Creator-Webhook Antwort (unbekanntes Format):\n{body[:400]}"

        # Automatically tag the new workflow with 'clara' so it's auto-discovered
        tag_ok = False
        try:
            api_timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(
                headers=self._headers(), timeout=api_timeout
            ) as api_session:
                tag_ok = await self._assign_clara_tag(api_session, wf_id)
        except Exception as _e:
            logger.warning("Could not assign 'clara' tag to workflow %s: %s", wf_id, _e)

        tag_note = " | Tag 'clara' zugewiesen" if tag_ok else " | Tag konnte nicht zugewiesen werden — bitte manuell in n8n setzen"
        return (
            f"Workflow **{wf_name}** erstellt (ID: `{wf_id}`).{tag_note}\n"
            f"Status: inaktiv — bitte in n8n pruefen und aktivieren:\n"
            f"  n8n-Skill: action=activate, workflow_id={wf_id}\n"
            f"  oder direkt: {wf_url}\n"
            f"Nach dem Aktivieren ist der Workflow als Clara-Tool verfuegbar: action=run_tool, workflow_name='{wf_name}'"
        )

    async def _get_or_create_clara_tag(self, session: aiohttp.ClientSession) -> str | None:
        """Ensure a 'clara' tag exists in n8n and return its ID."""
        async with session.get(self._url("tags")) as resp:
            if not resp.ok:
                return None
            data = await resp.json()
        tags = data.get("data", data) if isinstance(data, dict) else data
        for tag in tags:
            if tag.get("name", "").lower() == "clara":
                return tag["id"]
        # Create the tag
        async with session.post(self._url("tags"), json={"name": "clara"}) as resp:
            if not resp.ok:
                return None
            created = await resp.json()
        return created.get("id")

    async def _assign_clara_tag(self, session: aiohttp.ClientSession, workflow_id: str) -> bool:
        """Tag a workflow with 'clara'. Returns True on success."""
        tag_id = await self._get_or_create_clara_tag(session)
        if not tag_id:
            return False
        async with session.put(
            self._url(f"workflows/{workflow_id}/tags"),
            json=[{"id": tag_id}],
        ) as resp:
            return resp.ok

    async def _fetch_clara_workflows(self, session: aiohttp.ClientSession) -> list[dict]:
        """Return all active workflows tagged 'clara'."""
        async with session.get(self._url("workflows")) as resp:
            resp.raise_for_status()
            data = await resp.json()
        return [
            w for w in data.get("data", [])
            if any(t.get("name", "").lower() == "clara" for t in w.get("tags", []))
        ]

    async def _list_clara_tools(self, session: aiohttp.ClientSession) -> str:
        workflows = await self._fetch_clara_workflows(session)
        if not workflows:
            return (
                "Keine Clara-Tools vorhanden. "
                "Erstelle einen mit: action=create_tool, description='...'"
            )
        lines = [f"Clara-Tools ({len(workflows)} gesamt, Tag: 'clara'):\n"]
        for w in workflows:
            status = "aktiv" if w.get("active") else "inaktiv"
            trigger = "manuell"
            for node in w.get("nodes", []):
                t = node.get("type", "")
                if "scheduleTrigger" in t:
                    trigger = "zeitgesteuert"
                    break
                if "webhook" in t.lower():
                    trigger = "webhook"
                    break
            lines.append(
                f"- **{w['name']}** (ID: `{w['id']}`) — {status} | Trigger: {trigger}"
            )
        lines.append(
            "\nAufruf: action=run_tool, workflow_name='<Name>' [, input_data='{...}']"
        )
        return "\n".join(lines)

    async def _run_tool(
        self,
        session: aiohttp.ClientSession,
        workflow_name: str,
        input_data_str: str,
    ) -> str:
        if not workflow_name.strip():
            return "Fehler: 'workflow_name' ist erforderlich fuer run_tool."

        workflows = await self._fetch_clara_workflows(session)
        name_lower = workflow_name.strip().lower()
        matches = [w for w in workflows if name_lower in w.get("name", "").lower()]

        if not matches:
            return (
                f"Kein Clara-Tool mit Name '{workflow_name}' gefunden.\n"
                "Verfuegbare Tools anzeigen: action=list_clara_tools"
            )
        if len(matches) > 1:
            names = ", ".join(f"'{w['name']}'" for w in matches)
            return f"Mehrdeutig — {len(matches)} Treffer: {names}. Bitte genaueren Namen angeben."

        wf = matches[0]
        wf_id = wf["id"]
        wf_name = wf["name"]

        if not wf.get("active"):
            return (
                f"Workflow **{wf_name}** ist inaktiv und kann nicht ausgefuehrt werden.\n"
                f"Aktivieren: action=activate, workflow_id={wf_id}"
            )

        # Check for webhook trigger node
        webhook_node = next(
            (n for n in wf.get("nodes", []) if "webhook" in n.get("type", "").lower()),
            None,
        )

        if webhook_node:
            webhook_path = webhook_node.get("parameters", {}).get("path", "")
            if not webhook_path:
                return f"Webhook-Trigger in '{wf_name}' hat keinen 'path'-Parameter."
            webhook_url = f"{Config.N8N_BASE_URL.rstrip('/')}/webhook/{webhook_path}"
            try:
                payload = json.loads(input_data_str) if input_data_str.strip() else {}
            except json.JSONDecodeError as e:
                return f"Fehler: input_data ist kein gueltiges JSON — {e}"

            long_timeout = aiohttp.ClientTimeout(total=60)
            async with aiohttp.ClientSession(timeout=long_timeout) as wh_session:
                async with wh_session.post(webhook_url, json=payload) as resp:
                    body = await resp.text()
                    if not resp.ok:
                        return f"Webhook-Fehler {resp.status}: {body[:300]}"
                    try:
                        result = json.loads(body)
                        result_str = json.dumps(result, ensure_ascii=False, indent=2)
                        if len(result_str) > 600:
                            result_str = result_str[:600] + "\n... (gekuerzt)"
                    except json.JSONDecodeError:
                        result_str = body[:600]
            return f"Tool **{wf_name}** ausgefuehrt (via Webhook):\n{result_str}"

        # No webhook — use run API
        async with session.post(self._url(f"workflows/{wf_id}/run"), json={}) as resp:
            resp.raise_for_status()
            data = await resp.json()
        exec_id = data.get("data", {}).get("executionId", "?")
        return (
            f"Tool **{wf_name}** gestartet (via API).\n"
            f"Execution-ID: `{exec_id}`\n"
            f"Ergebnis abrufen: action=get_execution, execution_id={exec_id}"
        )

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

    # Map of short/wrong node types → correct n8n-nodes-base.* types
    _NODE_TYPE_MAP: dict[str, str] = {
        "scheduler": "n8n-nodes-base.scheduleTrigger",
        "scheduletrigger": "n8n-nodes-base.scheduleTrigger",
        "cron": "n8n-nodes-base.scheduleTrigger",
        "trigger": "n8n-nodes-base.manualTrigger",
        "manualtrigger": "n8n-nodes-base.manualTrigger",
        "webhook": "n8n-nodes-base.webhook",
        "httprequest": "n8n-nodes-base.httpRequest",
        "http": "n8n-nodes-base.httpRequest",
        "set": "n8n-nodes-base.set",
        "if": "n8n-nodes-base.if",
        "switch": "n8n-nodes-base.switch",
        "code": "n8n-nodes-base.code",
        "function": "n8n-nodes-base.code",
        "noop": "n8n-nodes-base.noOp",
        "merge": "n8n-nodes-base.merge",
        "discord": "n8n-nodes-base.discord",
        "telegram": "n8n-nodes-base.telegram",
        "slack": "n8n-nodes-base.slack",
        "emailsend": "n8n-nodes-base.emailSend",
        "gmail": "n8n-nodes-base.gmail",
        "rss": "n8n-nodes-base.rssFeedRead",
        "rssfeedread": "n8n-nodes-base.rssFeedRead",
        "datetime": "n8n-nodes-base.dateTime",
    }

    def _sanitize_workflow(self, payload: dict) -> tuple[dict, list[str]]:
        """Fix common LLM mistakes in workflow JSON before sending to n8n API."""
        fixes: list[str] = []

        # Ensure required top-level fields
        if "connections" not in payload:
            payload["connections"] = {}
            fixes.append("connections: {} ergaenzt")
        if "settings" not in payload:
            payload["settings"] = {"executionOrder": "v1"}
            fixes.append("settings: {executionOrder: v1} ergaenzt")
        if "staticData" not in payload:
            payload["staticData"] = None

        # Fix node types
        for node in payload.get("nodes", []):
            raw_type = node.get("type", "")
            if not raw_type.startswith("n8n-nodes-base.") and not raw_type.startswith("@n8n/"):
                key = raw_type.lower().replace("-", "").replace("_", "")
                corrected = self._NODE_TYPE_MAP.get(key)
                if corrected:
                    fixes.append(f"Node-Typ '{raw_type}' → '{corrected}'")
                    node["type"] = corrected
                else:
                    fixes.append(f"WARNUNG: Unbekannter Node-Typ '{raw_type}' — unveraendert")

            # Ensure typeVersion exists
            if "typeVersion" not in node:
                node["typeVersion"] = 1
                fixes.append(f"typeVersion=1 fuer Node '{node.get('name', '?')}' ergaenzt")

            # Ensure parameters exists
            if "parameters" not in node:
                node["parameters"] = {}

        return payload, fixes

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

        # Auto-fix common LLM mistakes before sending to n8n
        payload, fixes = self._sanitize_workflow(payload)
        if fixes:
            logger.info("n8n_skill: sanitized workflow — %s", "; ".join(fixes))

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
