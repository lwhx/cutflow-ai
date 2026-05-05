import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.clients.tuding_client import TudingAIClient, TudingAIError
from app.core.config import Settings
from app.schemas.task import TaskDetail, TaskItem, TaskMode, TaskStatus
from app.services.image_service import ImageService


class TaskServiceError(Exception):
    pass


class TaskService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.image_service = ImageService(settings)
        self.client = TudingAIClient(settings)
        self._lock = threading.Lock()

    def create_task(self, files: list[UploadFile], mode: TaskMode, border: int, file_keys: list[str] | None = None) -> TaskDetail:
        if not files:
            raise TaskServiceError("请至少上传一张图片")
        task_id = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
        items: list[TaskItem] = []
        saved_files: list[dict[str, str]] = []
        for index, upload_file in enumerate(files, start=1):
            original_name = Path(upload_file.filename or f"image_{index}.png").name
            saved_path = self.image_service.save_upload_file(task_id, upload_file)
            item_id = f"item_{index:03d}"
            file_key = file_keys[index - 1] if file_keys and len(file_keys) >= index else item_id
            items.append(TaskItem(itemId=item_id, fileKey=file_key, fileName=original_name, status="pending"))
            saved_files.append({"itemId": item_id, "fileKey": file_key, "fileName": original_name, "path": str(saved_path)})

        detail = TaskDetail(
            taskId=task_id,
            status="pending",
            mode=mode,
            total=len(items),
            completed=0,
            failed=0,
            logs=["任务已创建"],
            items=items,
        )
        self._write_task(task_id, detail.model_dump(), saved_files)
        thread = threading.Thread(target=self._process_task, args=(task_id, saved_files, mode, border), daemon=True)
        thread.start()
        return detail

    def get_task(self, task_id: str) -> TaskDetail:
        data = self._read_task_data(task_id)
        return TaskDetail(**data["detail"])

    def get_item_result_path(self, task_id: str, item_id: str) -> Path:
        data = self._read_task_data(task_id)
        result_path = data.get("results", {}).get(item_id)
        if not result_path:
            raise TaskServiceError("结果文件不存在或任务尚未完成")
        path = Path(result_path)
        if not path.exists():
            raise TaskServiceError("结果文件已被删除")
        return path

    def get_success_result_paths(self, task_id: str) -> list[Path]:
        data = self._read_task_data(task_id)
        paths = [Path(path) for path in data.get("results", {}).values()]
        return [path for path in paths if path.exists()]

    def pause_task(self, task_id: str) -> TaskDetail:
        with self._lock:
            data = self._read_task_data(task_id)
            detail = data["detail"]
            if detail["status"] not in {"pending", "processing"}:
                return TaskDetail(**detail)
            detail["status"] = "paused"
            for item in detail["items"]:
                if item["status"] in {"pending", "submitted"}:
                    item["status"] = "paused"
                    item["message"] = "已暂停，等待下次处理"
            detail["logs"].append("已请求暂停，正在上传或扣图中的图片会继续完成")
            self._refresh_counts(detail)
            self._write_task(task_id, detail, data["files"], data.get("results", {}))
            return TaskDetail(**detail)

    def _task_has_active_items(self, detail: dict[str, Any]) -> bool:
        return any(item["status"] in {"uploading", "submitted", "processing"} for item in detail["items"])

    def _is_task_paused(self, task_id: str) -> bool:
        data = self._read_task_data(task_id)
        detail = data["detail"]
        return detail["status"] == "paused" and not self._task_has_active_items(detail)

    def _pause_remaining_items(self, task_id: str) -> None:
        with self._lock:
            data = self._read_task_data(task_id)
            detail = data["detail"]
            for item in detail["items"]:
                if item["status"] in {"pending", "submitted"}:
                    item["status"] = "paused"
                    item["message"] = "已暂停，等待下次处理"
            detail["status"] = "paused"
            self._refresh_counts(detail)
            self._write_task(task_id, detail, data["files"], data.get("results", {}))

    def _process_task(self, task_id: str, saved_files: list[dict[str, str]], mode: TaskMode, border: int) -> None:
        self._update_task_status(task_id, "processing", log="开始处理任务")
        if mode == "batch":
            chunks = [saved_files[index:index + self.settings.max_batch_size] for index in range(0, len(saved_files), self.settings.max_batch_size)]
            for chunk_index, chunk in enumerate(chunks, start=1):
                if self._is_task_paused(task_id):
                    self._pause_remaining_items(task_id)
                    return
                self._append_log(task_id, f"开始处理第 {chunk_index}/{len(chunks)} 批，每批最多 {self.settings.max_batch_size} 张")
                self._process_batch_chunk(task_id, chunk, border)
        else:
            for file_info in saved_files:
                if self._is_task_paused(task_id):
                    self._pause_remaining_items(task_id)
                    return
                self._process_single_item(task_id, file_info, border)
        if self._is_task_paused(task_id):
            self._pause_remaining_items(task_id)
            return
        self._finalize_task(task_id)

    def _process_single_item(self, task_id: str, file_info: dict[str, str], border: int) -> None:
        item_id = file_info["itemId"]
        file_name = file_info["fileName"]
        local_path = Path(file_info["path"])
        try:
            self._update_item(task_id, item_id, status="uploading", message="正在上传图片", log=f"上传图片: {file_name}")
            uploaded = self.client.upload_local_image(local_path)
            if uploaded["resized"]:
                self._append_log(task_id, f"图片超过 {self.settings.max_image_side} 像素，已自动缩小: {file_name}")
            self._update_item(task_id, item_id, status="submitted", message="扣图任务已提交")
            remote_task_id = self.client.remove_bg_single(uploaded["image_url"], uploaded["width"], uploaded["height"], border=border)
            self._append_log(task_id, f"扣图任务已提交: {remote_task_id}")
            self._update_item(task_id, item_id, status="processing", message="正在等待扣图结果")
            result = self.client.poll_single_task_result(remote_task_id)
            output_path = self._build_result_path(task_id, file_name)
            self.client.download_file(result["result_url"], output_path)
            self._mark_item_done(task_id, item_id, output_path, "处理完成")
        except Exception as error:
            self._mark_item_failed(task_id, item_id, str(error))

    def _process_batch_chunk(self, task_id: str, chunk: list[dict[str, str]], border: int) -> None:
        uploaded_items: list[dict[str, Any]] = []
        local_map: dict[str, dict[str, str]] = {}
        for file_info in chunk:
            if self._is_task_paused(task_id):
                self._pause_remaining_items(task_id)
                break
            item_id = file_info["itemId"]
            file_name = file_info["fileName"]
            try:
                self._update_item(task_id, item_id, status="uploading", message="正在上传图片", log=f"上传图片: {file_name}")
                uploaded = self.client.upload_local_image(Path(file_info["path"]))
                uploaded_items.append({"image": uploaded["image_url"], "width": uploaded["width"], "height": uploaded["height"]})
                local_map[uploaded["image_url"]] = file_info
                self._update_item(task_id, item_id, status="submitted", message="已加入批量扣图任务")
                if uploaded["resized"]:
                    self._append_log(task_id, f"图片超过 {self.settings.max_image_side} 像素，已自动缩小: {file_name}")
            except Exception as error:
                self._mark_item_failed(task_id, item_id, str(error))
        if not uploaded_items:
            return
        try:
            parent_task_id = self.client.remove_bg_batch(uploaded_items, border=border)
            self._append_log(task_id, f"批量任务已提交: {parent_task_id}")
            items = self.client.poll_batch_task_result(parent_task_id, expected_count=len(uploaded_items))
            for index, item in enumerate(items):
                image_url = item.get("image")
                file_info = local_map.get(image_url) or chunk[index]
                item_id = file_info["itemId"]
                result_url = item.get("result_url")
                if not result_url:
                    self._mark_item_failed(task_id, item_id, "接口未返回结果地址")
                    continue
                output_path = self._build_result_path(task_id, file_info["fileName"])
                self.client.download_file(result_url, output_path)
                self._mark_item_done(task_id, item_id, output_path, "处理完成")
        except Exception as error:
            for file_info in chunk:
                current = self.get_task(task_id)
                target = next((item for item in current.items if item.itemId == file_info["itemId"]), None)
                if target and target.status not in {"done", "failed"}:
                    self._mark_item_failed(task_id, file_info["itemId"], str(error))

    def _build_result_path(self, task_id: str, file_name: str) -> Path:
        result_dir = self.settings.result_dir / task_id
        result_dir.mkdir(parents=True, exist_ok=True)
        return result_dir / self.image_service.build_output_name(file_name)

    def _task_file(self, task_id: str) -> Path:
        return self.settings.task_dir / f"{task_id}.json"

    def _read_task_data(self, task_id: str) -> dict[str, Any]:
        task_file = self._task_file(task_id)
        if not task_file.exists():
            raise TaskServiceError("任务不存在")
        with open(task_file, "r", encoding="utf-8") as file:
            return json.load(file)

    def _write_task(self, task_id: str, detail: dict[str, Any], files: list[dict[str, str]], results: dict[str, str] | None = None) -> None:
        payload = {"detail": detail, "files": files, "results": results or {}}
        with open(self._task_file(task_id), "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)

    def _update_task_status(self, task_id: str, status: TaskStatus, log: str | None = None) -> None:
        with self._lock:
            data = self._read_task_data(task_id)
            detail = data["detail"]
            detail["status"] = status
            if log:
                detail["logs"].append(log)
            self._refresh_counts(detail)
            self._write_task(task_id, detail, data["files"], data.get("results", {}))

    def _update_task(self, task_id: str, *, status: str | None = None, log: str | None = None) -> None:
        with self._lock:
            data = self._read_task_data(task_id)
            detail = data["detail"]
            if status:
                detail["status"] = status
            if log:
                detail["logs"].append(log)
            self._refresh_counts(detail)
            self._write_task(task_id, detail, data["files"], data.get("results", {}))

    def _append_log(self, task_id: str, log: str) -> None:
        self._update_task(task_id, log=log)

    def _update_item(self, task_id: str, item_id: str, *, status: str, message: str, log: str | None = None) -> None:
        with self._lock:
            data = self._read_task_data(task_id)
            detail = data["detail"]
            for item in detail["items"]:
                if item["itemId"] == item_id:
                    item["status"] = status
                    item["message"] = message
                    break
            if log:
                detail["logs"].append(log)
            self._refresh_counts(detail)
            self._write_task(task_id, detail, data["files"], data.get("results", {}))

    def _mark_item_done(self, task_id: str, item_id: str, output_path: Path, message: str) -> None:
        with self._lock:
            data = self._read_task_data(task_id)
            detail = data["detail"]
            results = data.get("results", {})
            results[item_id] = str(output_path)
            for item in detail["items"]:
                if item["itemId"] == item_id:
                    item["status"] = "done"
                    item["message"] = message
                    item["downloadUrl"] = f"/api/tasks/{task_id}/items/{item_id}/download"
                    break
            detail["logs"].append(f"已保存结果: {output_path.name}")
            self._refresh_counts(detail)
            self._write_task(task_id, detail, data["files"], results)

    def _mark_item_failed(self, task_id: str, item_id: str, message: str) -> None:
        self._update_item(task_id, item_id, status="failed", message=message, log=f"处理失败: {message}")

    def _finalize_task(self, task_id: str) -> None:
        with self._lock:
            data = self._read_task_data(task_id)
            detail = data["detail"]
            self._refresh_counts(detail)
            detail["status"] = "failed" if detail["failed"] == detail["total"] else "done"
            detail["logs"].append("全部任务执行完成" if detail["status"] == "done" else "任务执行失败")
            self._write_task(task_id, detail, data["files"], data.get("results", {}))

    @staticmethod
    def _refresh_counts(detail: dict[str, Any]) -> None:
        detail["completed"] = len([item for item in detail["items"] if item["status"] == "done"])
        detail["failed"] = len([item for item in detail["items"] if item["status"] == "failed"])
