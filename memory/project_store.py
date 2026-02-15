import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class ProjectStore:
    def __init__(self, db):
        self.db = db

    async def create_project(self, name: str, description: str = "") -> dict:
        cursor = await self.db.execute(
            "INSERT INTO projects (name, description) VALUES (?, ?)",
            (name, description),
        )
        return {"id": cursor.lastrowid, "name": name, "description": description, "status": "active"}

    async def list_projects(self, status: str | None = None) -> list[dict]:
        if status:
            rows = await self.db.fetchall(
                "SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC", (status,)
            )
        else:
            rows = await self.db.fetchall("SELECT * FROM projects ORDER BY updated_at DESC")
        return [dict(row) for row in rows]

    async def get_project(self, name: str) -> dict | None:
        row = await self.db.fetchone("SELECT * FROM projects WHERE name = ?", (name,))
        return dict(row) if row else None

    async def update_project(self, name: str, **kwargs) -> bool:
        sets = []
        values = []
        for k, v in kwargs.items():
            if k in ("description", "status", "data"):
                sets.append(f"{k} = ?")
                values.append(v)
        if not sets:
            return False
        sets.append("updated_at = ?")
        values.append(datetime.now().isoformat())
        values.append(name)
        await self.db.execute(
            f"UPDATE projects SET {', '.join(sets)} WHERE name = ?", tuple(values)
        )
        return True

    async def delete_project(self, name: str) -> bool:
        project = await self.get_project(name)
        if not project:
            return False
        await self.db.execute("DELETE FROM tasks WHERE project_id = ?", (project["id"],))
        await self.db.execute("DELETE FROM projects WHERE name = ?", (name,))
        return True

    # --- Tasks ---

    async def add_task(self, project_name: str, title: str, description: str = "", priority: int = 0) -> dict | None:
        project = await self.get_project(project_name)
        if not project:
            return None
        cursor = await self.db.execute(
            "INSERT INTO tasks (project_id, title, description, priority) VALUES (?, ?, ?, ?)",
            (project["id"], title, description, priority),
        )
        return {"id": cursor.lastrowid, "title": title, "status": "pending"}

    async def list_tasks(self, project_name: str) -> list[dict]:
        project = await self.get_project(project_name)
        if not project:
            return []
        rows = await self.db.fetchall(
            "SELECT * FROM tasks WHERE project_id = ? ORDER BY priority DESC, created_at",
            (project["id"],),
        )
        return [dict(row) for row in rows]

    async def update_task(self, task_id: int, status: str) -> bool:
        await self.db.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
        return True
