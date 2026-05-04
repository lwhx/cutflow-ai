from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.schemas.task import CreateTaskResponse, TaskDetail, TaskMode
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
) -> CreateTaskResponse:
    try:
        detail = task_service.create_task(files, mode, border)
        return CreateTaskResponse(taskId=detail.taskId, total=detail.total, status=detail.status)
    except (TaskServiceError, ImageServiceError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: str) -> TaskDetail:
    try:
        return task_service.get_task(task_id)
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
