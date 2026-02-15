import logging

logger = logging.getLogger(__name__)

# Category display names (German)
_CATEGORY_LABELS = {
    "vorlieben": "Vorlieben",
    "persoenlich": "Persoenliches",
    "technik": "Technik",
    "ziele": "Ziele",
    "projekte": "Projekte",
    "gewohnheiten": "Gewohnheiten",
    "wichtig": "Wichtig",
}


async def build_memory_context(db, limit: int = 30) -> str:
    """Build a memory context string for injection into the system prompt.

    Returns an empty string if no memories exist.
    """
    memories = await db.get_recent_memories(limit=limit)
    if not memories:
        return ""

    # Group by category, preserving recency order within each group
    grouped: dict[str, list[dict]] = {}
    for m in memories:
        cat = m["category"]
        grouped.setdefault(cat, []).append(m)

    lines = ["", "Dein Gedaechtnis (was du ueber Marlon weisst):"]
    for cat, entries in grouped.items():
        label = _CATEGORY_LABELS.get(cat, cat.capitalize())
        for e in entries:
            lines.append(f"- [{label}] {e['key']}: {e['value']}")

    lines.append("")
    lines.append(
        "Nutze dieses Wissen aktiv in Gespraechen. "
        "Speichere neue Fakten mit dem memory_manager Tool."
    )

    return "\n".join(lines)
