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

    # --- Extended queries (UI endpoints) ---

    async def list_projects_with_task_counts(self) -> list[dict]:
        rows = await self.db.fetchall("""
            SELECT p.*,
                COUNT(t.id) as task_count,
                SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as tasks_done,
                SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as tasks_in_progress,
                SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as tasks_pending
            FROM projects p
            LEFT JOIN tasks t ON t.project_id = p.id
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        """)
        return [dict(row) for row in rows]

    async def get_project_by_id(self, project_id: int) -> dict | None:
        row = await self.db.fetchone("SELECT * FROM projects WHERE id = ?", (project_id,))
        return dict(row) if row else None

    async def list_tasks_by_project_id(self, project_id: int) -> list[dict]:
        rows = await self.db.fetchall(
            "SELECT * FROM tasks WHERE project_id = ? ORDER BY priority DESC, created_at",
            (project_id,),
        )
        return [dict(row) for row in rows]

    async def update_task_fields(self, task_id: int, **kwargs) -> bool:
        allowed = {"status", "title", "description", "priority", "due_date"}
        sets, values = [], []
        for k, v in kwargs.items():
            if k in allowed:
                sets.append(f"{k} = ?")
                values.append(v)
        if not sets:
            return False
        values.append(task_id)
        await self.db.execute(
            f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", tuple(values)
        )
        return True

    async def delete_task(self, task_id: int) -> bool:
        await self.db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        return True
