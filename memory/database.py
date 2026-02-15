import json
import logging
import aiosqlite
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db: aiosqlite.Connection | None = None

    async def initialize(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = await aiosqlite.connect(str(self.db_path))
        self.db.row_factory = aiosqlite.Row
        await self._create_tables()
        await self._create_indexes()
        logger.info(f"Database initialized at {self.db_path}")

    async def _create_tables(self):
        await self.db.executescript("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(category, key)
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                data TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                priority INTEGER DEFAULT 0,
                due_date TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
        """)
        await self.db.commit()

    async def _create_indexes(self):
        await self.db.executescript("""
            CREATE INDEX IF NOT EXISTS idx_conversations_session
                ON conversations(session_id, id);
            CREATE INDEX IF NOT EXISTS idx_memory_category
                ON memory(category);
            CREATE INDEX IF NOT EXISTS idx_memory_category_key
                ON memory(category, key);
            CREATE INDEX IF NOT EXISTS idx_tasks_project_id
                ON tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_status
                ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_projects_status
                ON projects(status);
        """)
        await self.db.commit()

    async def close(self):
        if self.db:
            await self.db.close()
            logger.info("Database connection closed")

    # --- Conversation methods ---

    async def save_message(self, session_id: str, role: str, content: str):
        await self.db.execute(
            "INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (session_id, role, content, datetime.now().isoformat()),
        )
        await self.db.commit()

    async def get_history(self, session_id: str, limit: int = 20) -> list[dict]:
        cursor = await self.db.execute(
            "SELECT role, content FROM ("
            "  SELECT role, content, id FROM conversations"
            "  WHERE session_id = ? ORDER BY id DESC LIMIT ?"
            ") sub ORDER BY id ASC",
            (session_id, limit),
        )
        rows = await cursor.fetchall()
        return [{"role": row["role"], "content": row["content"]} for row in rows]

    async def clear_history(self, session_id: str):
        await self.db.execute("DELETE FROM conversations WHERE session_id = ?", (session_id,))
        await self.db.commit()

    # --- Memory methods ---

    async def remember(self, category: str, key: str, value: str):
        await self.db.execute(
            """INSERT INTO memory (category, key, value, timestamp) VALUES (?, ?, ?, ?)
               ON CONFLICT(category, key) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp""",
            (category, key, value, datetime.now().isoformat()),
        )
        await self.db.commit()

    async def recall(self, category: str, key: str) -> str | None:
        cursor = await self.db.execute(
            "SELECT value FROM memory WHERE category = ? AND key = ?",
            (category, key),
        )
        row = await cursor.fetchone()
        return row["value"] if row else None

    async def recall_category(self, category: str) -> list[dict]:
        cursor = await self.db.execute(
            "SELECT key, value FROM memory WHERE category = ? ORDER BY timestamp DESC",
            (category,),
        )
        rows = await cursor.fetchall()
        return [{"key": row["key"], "value": row["value"]} for row in rows]

    async def forget(self, category: str, key: str):
        await self.db.execute("DELETE FROM memory WHERE category = ? AND key = ?", (category, key))
        await self.db.commit()

    async def search_memory(self, query: str, limit: int = 20) -> list[dict]:
        cursor = await self.db.execute(
            "SELECT category, key, value, timestamp FROM memory "
            "WHERE key LIKE ? OR value LIKE ? ORDER BY timestamp DESC LIMIT ?",
            (f"%{query}%", f"%{query}%", limit),
        )
        rows = await cursor.fetchall()
        return [{"category": r["category"], "key": r["key"], "value": r["value"], "timestamp": r["timestamp"]} for r in rows]

    async def get_recent_memories(self, limit: int = 20) -> list[dict]:
        cursor = await self.db.execute(
            "SELECT category, key, value, timestamp FROM memory ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [{"category": r["category"], "key": r["key"], "value": r["value"], "timestamp": r["timestamp"]} for r in rows]

    async def get_all_categories(self) -> list[str]:
        cursor = await self.db.execute(
            "SELECT DISTINCT category FROM memory ORDER BY category"
        )
        rows = await cursor.fetchall()
        return [r["category"] for r in rows]

    async def delete_category(self, category: str):
        await self.db.execute("DELETE FROM memory WHERE category = ?", (category,))
        await self.db.commit()

    async def count_memories(self) -> int:
        cursor = await self.db.execute("SELECT COUNT(*) as cnt FROM memory")
        row = await cursor.fetchone()
        return row["cnt"] if row else 0

    # --- Raw execute for stores ---

    async def execute(self, sql: str, params: tuple = ()):
        cursor = await self.db.execute(sql, params)
        await self.db.commit()
        return cursor

    async def fetchall(self, sql: str, params: tuple = ()) -> list:
        cursor = await self.db.execute(sql, params)
        return await cursor.fetchall()

    async def fetchone(self, sql: str, params: tuple = ()):
        cursor = await self.db.execute(sql, params)
        return await cursor.fetchone()
