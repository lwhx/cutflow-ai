from typing import Literal

from pydantic import BaseModel

TaskStatus = Literal["pending", "processing", "paused", "done", "failed"]
TaskItemStatus = Literal["pending", "uploading", "submitted", "processing", "paused", "done", "failed"]
TaskMode = Literal["single", "batch"]


class TaskItem(BaseModel):
    itemId: str
    fileKey: str
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


class TaskListResponse(BaseModel):
    tasks: list[TaskDetail]


class ClearTasksResponse(BaseModel):
    deletedTasks: int
    deletedFiles: int


class DeleteTaskItemResponse(BaseModel):
    deletedTask: bool
    deletedItem: bool
    deletedFiles: int
    task: TaskDetail | None = None
