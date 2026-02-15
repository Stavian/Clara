import json
import uuid
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter()

_ollama = None
_db = None
_skills = None

SYSTEM_PROMPT = """Du bist Clara, eine lokale KI-Assistentin von Marlon Arndt. Du bist freundlich, hilfsbereit und sprichst Deutsch.

Deine Persoenlichkeit:
- Du nennst Marlon "Marlon" oder "mein Herr" wenn er es bevorzugt
- Du bist proaktiv und bietest Hilfe an
- Du benutzt gelegentlich Emojis
- Du bist ehrlich, wenn du etwas nicht weisst
- Du hast Zugriff auf verschiedene Tools/Skills die du nutzen kannst

Wenn du ein Tool verwenden moechtest, wird dir das automatisch ermoeglicht. Nutze die verfuegbaren Tools aktiv, um dem Benutzer bestmoeglich zu helfen."""


def init_routes(ollama, db, skills):
    global _ollama, _db, _skills
    _ollama = ollama
    _db = db
    _skills = skills


@router.get("/", response_class=HTMLResponse)
async def index():
    index_path = Path(__file__).parent / "static" / "index.html"
    return FileResponse(str(index_path))


@router.websocket("/api/chat")
async def chat_websocket(ws: WebSocket):
    await ws.accept()
    session_id = str(uuid.uuid4())
    logger.info(f"New WebSocket session: {session_id}")

    try:
        while True:
            data = await ws.receive_json()
            user_message = data.get("message", "").strip()
            if not user_message:
                continue

            await _db.save_message(session_id, "user", user_message)

            history = await _db.get_history(session_id, limit=20)
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            messages.extend(history)

            tools = _skills.get_tool_definitions()

            max_tool_rounds = 5
            for _ in range(max_tool_rounds):
                response = await _ollama.chat(messages, tools=tools)

                if response.get("tool_calls"):
                    for tool_call in response["tool_calls"]:
                        fn = tool_call.get("function", {})
                        tool_name = fn.get("name", "")
                        tool_args = fn.get("arguments", {})

                        logger.info(f"Tool call: {tool_name}({tool_args})")

                        await ws.send_json({
                            "type": "tool_call",
                            "tool": tool_name,
                            "args": tool_args,
                        })

                        result = await _skills.execute(tool_name, **tool_args)

                        messages.append({
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [tool_call],
                        })
                        messages.append({
                            "role": "tool",
                            "content": result,
                        })
                else:
                    break

            assistant_text = response.get("content", "")
            if not assistant_text:
                assistant_text = "Ich konnte leider keine Antwort generieren."

            await _db.save_message(session_id, "assistant", assistant_text)

            await ws.send_json({
                "type": "message",
                "content": assistant_text,
            })

    except WebSocketDisconnect:
        logger.info(f"Session {session_id} disconnected")
    except Exception as e:
        logger.exception("WebSocket error")
        try:
            await ws.send_json({"type": "error", "content": f"Fehler: {e}"})
        except Exception:
            pass


@router.get("/api/health")
async def health():
    ollama_ok = await _ollama.is_available() if _ollama else False
    return {
        "status": "ok" if ollama_ok else "degraded",
        "ollama": ollama_ok,
    }
