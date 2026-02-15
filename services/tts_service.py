import re
import uuid
import logging
from pathlib import Path

import edge_tts

logger = logging.getLogger(__name__)


def _clean_text_for_speech(text: str) -> str:
    """Strip markdown, code blocks, URLs and other non-speech content."""
    # Remove code blocks (```...```)
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Remove inline code (`...`)
    text = re.sub(r'`[^`]+`', '', text)
    # Remove markdown images ![alt](url)
    text = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', text)
    # Remove markdown links but keep text [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove URLs
    text = re.sub(r'https?://\S+', '', text)
    # Remove markdown headers (### etc)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove bold/italic markers
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', text)
    # Remove emojis and other symbol characters
    text = re.sub(
        r'[\U0001F600-\U0001F64F'   # emoticons
        r'\U0001F300-\U0001F5FF'    # misc symbols & pictographs
        r'\U0001F680-\U0001F6FF'    # transport & map symbols
        r'\U0001F1E0-\U0001F1FF'    # flags
        r'\U0001F900-\U0001F9FF'    # supplemental symbols
        r'\U0001FA00-\U0001FA6F'    # chess symbols & extended-A
        r'\U0001FA70-\U0001FAFF'    # symbols & pictographs extended-A
        r'\U00002702-\U000027B0'    # dingbats
        r'\U0000FE00-\U0000FE0F'    # variation selectors
        r'\U0000200D'               # zero width joiner
        r'\U000023CF-\U000023F3'    # misc technical
        r'\U0000231A-\U0000231B'    # watch/hourglass
        r'\U00002B50'               # star
        r'\U000025AA-\U000025FE]+', # geometric shapes
        '', text
    )
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


async def generate_tts(text: str, voice: str, output_dir: Path) -> str | None:
    """Generate TTS audio from text. Returns filename or None on failure."""
    cleaned = _clean_text_for_speech(text)
    if not cleaned or len(cleaned) < 2:
        return None

    try:
        filename = f"{uuid.uuid4().hex}.mp3"
        output_path = output_dir / filename

        communicate = edge_tts.Communicate(cleaned, voice)
        await communicate.save(str(output_path))

        logger.info(f"TTS generated: {filename} ({len(cleaned)} chars)")
        return filename
    except Exception as e:
        logger.warning(f"TTS generation failed: {e}")
        return None
