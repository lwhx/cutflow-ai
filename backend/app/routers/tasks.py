from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.schemas.task import ClearTasksResponse, CreateTaskResponse, DeleteTaskItemResponse, TaskDetail, TaskListResponse, TaskMode
from app.services.archive_service import ArchiveService, ArchiveServiceError
from app.services.image_service import ImageServiceError
from app.services.task_service import TaskService, TaskServiceError

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
settings = get_settings()
task_service = TaskService(settings)
archive_service = ArchiveService(settings)


@router.post("", response_model=CreateTaskResponse)
def create_task(
    files: Annotated[list[UploadFile], File()],
    mode: Annotated[TaskMode, Form()] = "single",
    border: Annotated[int, Form()] = 2,
    fileKeys: Annotated[list[str] | None, Form()] = None,
) -> CreateTaskResponse:
    try:
        detail = task_service.create_task(files, mode, border, fileKeys)
        return CreateTaskResponse(taskId=detail.taskId, total=detail.total, status=detail.status)
    except (TaskServiceError, ImageServiceError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("", response_model=TaskListResponse)
def list_tasks() -> TaskListResponse:
    return TaskListResponse(tasks=task_service.list_tasks())


@router.delete("", response_model=ClearTasksResponse)
def clear_tasks() -> ClearTasksResponse:
    result = task_service.clear_all_history_tasks()
    return ClearTasksResponse(**result)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: str) -> TaskDetail:
    try:
        return task_service.get_task(task_id)
    except TaskServiceError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/{task_id}/pause", response_model=TaskDetail)
def pause_task(task_id: str) -> TaskDetail:
    try:
        return task_service.pause_task(task_id)
    except TaskServiceError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/{task_id}/items/{item_id}", response_model=DeleteTaskItemResponse)
def delete_task_item(task_id: str, item_id: str) -> DeleteTaskItemResponse:
    try:
        result = task_service.delete_task_item(task_id, item_id)
        return DeleteTaskItemResponse(**result)
    except TaskServiceError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/{task_id}/items/{item_id}/download")
def download_item(task_id: str, item_id: str) -> FileResponse:
    try:
        result_path = task_service.get_item_result_path(task_id, item_id)
        return FileResponse(result_path, filename=result_path.name, media_type="image/png")
    except TaskServiceError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/{task_id}/download.zip")
def download_zip(task_id: str) -> FileResponse:
    try:
        result_paths = task_service.get_success_result_paths(task_id)
        archive_path = archive_service.create_zip(task_id, result_paths)
        return FileResponse(archive_path, filename=Path(archive_path).name, media_type="application/zip")
    except (TaskServiceError, ArchiveServiceError) as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
