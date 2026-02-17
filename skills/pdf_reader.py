import asyncio
import logging
from pathlib import Path

import pdfplumber

from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)

MAX_OUTPUT_CHARS = 8000


class PDFReaderSkill(BaseSkill):
    @property
    def name(self) -> str:
        return "pdf_reader"

    @property
    def description(self) -> str:
        return (
            "Liest und verarbeitet PDF-Dokumente. Kann Text extrahieren, "
            "Metadaten anzeigen und Tabellen auslesen."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Pfad zur PDF-Datei.",
                },
                "action": {
                    "type": "string",
                    "enum": ["extract_text", "info", "extract_tables"],
                    "description": (
                        "'extract_text' extrahiert Text, 'info' zeigt Metadaten, "
                        "'extract_tables' extrahiert Tabellen."
                    ),
                },
                "pages": {
                    "type": "string",
                    "description": "Seitenbereiche, z.B. '1-3,5,8-10'. Ohne Angabe werden alle Seiten verarbeitet.",
                },
            },
            "required": ["file_path", "action"],
        }

    async def execute(self, file_path: str, action: str = "extract_text", **kwargs) -> str:
        try:
            path = Path(file_path)
            if not path.exists():
                return f"Fehler: Datei '{file_path}' nicht gefunden."
            if path.suffix.lower() != ".pdf":
                return f"Fehler: '{file_path}' ist keine PDF-Datei."

            loop = asyncio.get_event_loop()
            pages_str = kwargs.get("pages", "")

            if action == "info":
                return await loop.run_in_executor(None, self._get_info, path)
            elif action == "extract_tables":
                return await loop.run_in_executor(None, self._extract_tables, path, pages_str)
            else:
                return await loop.run_in_executor(None, self._extract_text, path, pages_str)
        except Exception as e:
            logger.exception("PDF processing failed")
            return f"Fehler bei PDF-Verarbeitung: {e}"

    @staticmethod
    def _parse_pages(pages_str: str, total_pages: int) -> list[int]:
        """Parse page ranges like '1-3,5,8-10' into a list of 0-based page indices."""
        if not pages_str:
            return list(range(total_pages))

        indices = set()
        for part in pages_str.split(","):
            part = part.strip()
            if "-" in part:
                start, end = part.split("-", 1)
                start = max(1, int(start))
                end = min(total_pages, int(end))
                indices.update(range(start - 1, end))
            else:
                idx = int(part) - 1
                if 0 <= idx < total_pages:
                    indices.add(idx)
        return sorted(indices)

    @staticmethod
    def _get_info(path: Path) -> str:
        with pdfplumber.open(str(path)) as pdf:
            meta = pdf.metadata or {}
            lines = [
                f"**PDF-Info:** {path.name}",
                f"- Seiten: {len(pdf.pages)}",
            ]
            for key in ("Title", "Author", "Subject", "Creator", "Producer", "CreationDate"):
                val = meta.get(key)
                if val:
                    lines.append(f"- {key}: {val}")
            return "\n".join(lines)

    def _extract_text(self, path: Path, pages_str: str) -> str:
        with pdfplumber.open(str(path)) as pdf:
            page_indices = self._parse_pages(pages_str, len(pdf.pages))
            output = []
            total_chars = 0

            for idx in page_indices:
                page = pdf.pages[idx]
                text = page.extract_text() or ""
                if not text.strip():
                    continue
                header = f"--- Seite {idx + 1} ---"
                segment = f"{header}\n{text}"
                total_chars += len(segment)
                if total_chars > MAX_OUTPUT_CHARS:
                    output.append(f"{header}\n{text[:MAX_OUTPUT_CHARS - total_chars + len(segment)]}...")
                    output.append(f"\n(Ausgabe bei {MAX_OUTPUT_CHARS} Zeichen gekuerzt)")
                    break
                output.append(segment)

            if not output:
                return "Kein Text in den angegebenen Seiten gefunden."
            return "\n\n".join(output)

    def _extract_tables(self, path: Path, pages_str: str) -> str:
        with pdfplumber.open(str(path)) as pdf:
            page_indices = self._parse_pages(pages_str, len(pdf.pages))
            output = []
            table_count = 0

            for idx in page_indices:
                page = pdf.pages[idx]
                tables = page.extract_tables()
                if not tables:
                    continue
                for t_idx, table in enumerate(tables):
                    table_count += 1
                    header = f"**Tabelle {table_count}** (Seite {idx + 1})"
                    rows = []
                    for row in table:
                        cells = [str(c) if c is not None else "" for c in row]
                        rows.append(" | ".join(cells))
                    output.append(f"{header}\n" + "\n".join(rows))

            if not output:
                return "Keine Tabellen in den angegebenen Seiten gefunden."
            result = "\n\n".join(output)
            if len(result) > MAX_OUTPUT_CHARS:
                return result[:MAX_OUTPUT_CHARS] + f"\n\n(Ausgabe bei {MAX_OUTPUT_CHARS} Zeichen gekuerzt)"
            return result
