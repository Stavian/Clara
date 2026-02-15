import json
import logging
import re

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """Analysiere den folgenden Gespraechsausschnitt zwischen einem Nutzer und einer KI-Assistentin.
Extrahiere ALLE neuen Fakten ueber den Nutzer (Name: Marlon).

Gib NUR ein JSON-Array zurueck. Jedes Element hat: category, key, value
Kategorien: vorlieben, persoenlich, technik, ziele, projekte, gewohnheiten, wichtig

Regeln:
- Nur EXPLIZIT genannte Fakten, NICHTS erfinden
- Kurze, praegnante Werte (max 100 Zeichen)
- Keys als kurze Bezeichner (z.B. "lieblingssprache", "beruf", "haustier")
- Wenn KEINE Fakten gefunden werden: leeres Array []
- KEIN erklarender Text, NUR das JSON-Array

Gespraech:
{conversation}

JSON-Array:"""


async def extract_facts(ollama, db, user_message: str, assistant_message: str):
    """Extract user facts from a conversation turn and store them in memory.

    Runs as fire-and-forget — errors are logged but never raised.
    """
    try:
        # Skip very short or trivial exchanges
        if len(user_message) < 10:
            return

        conversation = f"Nutzer: {user_message}\nAssistentin: {assistant_message}"
        prompt = EXTRACTION_PROMPT.format(conversation=conversation)

        raw = await ollama.generate(prompt)

        # Extract JSON array from response (model may wrap it in text/think blocks)
        raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE)
        match = re.search(r"\[[\s\S]*?\]", raw)
        if not match:
            return

        facts = json.loads(match.group())
        if not isinstance(facts, list):
            return

        stored = 0
        for fact in facts:
            cat = fact.get("category", "").strip()
            key = fact.get("key", "").strip()
            val = fact.get("value", "").strip()
            if cat and key and val and len(val) <= 200:
                await db.remember(cat, key, val)
                stored += 1

        if stored:
            logger.info(f"Fact extractor: stored {stored} facts")

    except json.JSONDecodeError:
        logger.debug("Fact extractor: could not parse JSON from LLM response")
    except Exception:
        logger.debug("Fact extractor: extraction failed", exc_info=True)
