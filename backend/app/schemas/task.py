from typing import Literal

from pydantic import BaseModel

TaskStatus = Literal["pending", "processing", "done", "failed"]
TaskItemStatus = Literal["pending", "uploading", "submitted", "processing", "done", "failed"]
TaskMode = Literal["single", "batch"]


class TaskItem(BaseModel):
    itemId: str
    fileName: str
    status: TaskItemStatus
    message: str = "等待处理"
    downloadUrl: str | None = None


class TaskDetail(BaseModel):
    taskId: str
    status: TaskStatus
    mode: TaskMode
    total: int
    completed: int
    failed: int
    logs: list[str]
    items: list[TaskItem]


class CreateTaskResponse(BaseModel):
    taskId: str
    total: int
    status: TaskStatus
