import json
import os
import tempfile
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from typing import Any

import requests
from PIL import Image

from app.core.config import Settings
from app.core.constants import API_BASE, COMMON_HEADERS


# 全局共享 session，用于连接复用
_global_session: requests.Session | None = None


def get_shared_session() -> requests.Session:
    global _global_session
    if _global_session is None:
        _global_session = requests.Session()
        _global_session.headers.update(COMMON_HEADERS)
    return _global_session


class TudingAIError(Exception):
    pass


class TudingAIClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.account = settings.tuding_account
        self.password = settings.tuding_password
        self.cookie_file = settings.cookie_file
        self.session = get_shared_session()
        self._upload_executor = ThreadPoolExecutor(max_workers=settings.max_concurrent_uploads)

    def save_cookies(self) -> None:
        self.cookie_file.parent.mkdir(parents=True, exist_ok=True)
        cookies_dict = requests.utils.dict_from_cookiejar(self.session.cookies)
        with open(self.cookie_file, "w", encoding="utf-8") as file:
            json.dump(cookies_dict, file, ensure_ascii=False, indent=2)

    def load_cookies(self) -> bool:
        if not self.cookie_file.exists():
            return False
        try:
            with open(self.cookie_file, "r", encoding="utf-8") as file:
                cookies_dict = json.load(file)
            self.session.cookies = requests.utils.cookiejar_from_dict(cookies_dict)
            return True
        except Exception:
            return False

    def clear_cookies(self) -> None:
        self.session.cookies.clear()
        try:
            if self.cookie_file.exists():
                self.cookie_file.unlink()
        except OSError:
            pass

    def login(self) -> None:
        if not self.account or not self.password:
            raise TudingAIError("缺少图丁 AI 账号或密码，请检查环境变量 TUDING_ACCOUNT 和 TUDING_PASSWORD")
        url = f"{API_BASE}/ps/plugin/loginByPassword"
        headers = {**COMMON_HEADERS, "Content-Type": "application/json;charset=UTF-8"}
        payload = {"account": self.account, "password": self.password}
        response = self.session.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        if not data.get("success") or data.get("code") != 200:
            raise TudingAIError(f"登录失败: {data}")
        self.save_cookies()

    def get_user_info(self) -> dict[str, Any]:
        url = f"{API_BASE}/ps/plugin/getUserInfo"
        response = self.session.post(url, timeout=30)
        response.raise_for_status()
        return response.json()

    def is_cookie_valid(self) -> bool:
        try:
            data = self.get_user_info()
            return bool(data.get("success") and data.get("code") == 200 and data.get("data"))
        except Exception:
            return False

    def ensure_login(self) -> None:
        loaded = self.load_cookies()
        if loaded and self.is_cookie_valid():
            return
        self.clear_cookies()
        self.login()
        if not self.is_cookie_valid():
            raise TudingAIError("登录后校验失败")

    def api_request(self, method: str, path: str, *, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        self.ensure_login()
        url = f"{API_BASE}{path}"
        headers = dict(COMMON_HEADERS)
        if json_body is not None:
            headers["Content-Type"] = "application/json;charset=UTF-8"
        response = self.session.request(
            method=method.upper(),
            url=url,
            headers=headers,
            json=json_body,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        if not data.get("success") or data.get("code") != 200:
            raise TudingAIError(f"接口调用失败 {path}: {data}")
        return data

    def get_oss_temporary_token(self) -> dict[str, Any]:
        data = self.api_request("GET", "/user/getOssTemporaryToken")
        return data["data"]

    def upload_local_image(self, local_path: Path, subdir: str = "ai_model") -> dict[str, Any]:
        upload_path, original_size, resized_size = self._prepare_upload_image(local_path)
        token = self.get_oss_temporary_token()
        host = token["host"]
        dir_prefix = token["dir"]
        access_id = token["accessId"]
        policy = token["policy"]
        signature = token["signature"]

        upload_path_obj = Path(upload_path)
        suffix = upload_path_obj.suffix.lower() or local_path.suffix.lower() or ".jpg"
        filename = f"{uuid.uuid4()}{suffix}"
        key = f"{dir_prefix}/{subdir}/{filename}"

        try:
            with open(upload_path, "rb") as file:
                files = {"file": (filename, file, "application/octet-stream")}
                data = {
                    "key": key,
                    "policy": policy,
                    "OSSAccessKeyId": access_id,
                    "signature": signature,
                    "success_action_status": "200",
                }
                # 使用共享 session，启用 HTTP keep-alive
                response = self.session.post(host, data=data, files=files, timeout=60)
                response.raise_for_status()
        finally:
            if upload_path != local_path:
                try:
                    os.remove(upload_path)
                except OSError:
                    pass

        width, height = resized_size
        return {
            "image_url": f"{host}/{key}",
            "width": width,
            "height": height,
            "key": key,
            "local_path": str(local_path),
            "original_width": original_size[0],
            "original_height": original_size[1],
            "resized": original_size != resized_size,
        }

    def upload_local_image_async(self, local_path: Path, subdir: str = "ai_model") -> Future[dict[str, Any]]:
        return self._upload_executor.submit(self.upload_local_image, local_path, subdir)

    def _prepare_upload_image(self, local_path: Path) -> tuple[Path, tuple[int, int], tuple[int, int]]:
        with Image.open(local_path) as image:
            original_size = image.size
            if max(original_size) <= self.settings.max_image_side:
                return local_path, original_size, original_size

            image_for_save = image.copy()
            image_for_save.thumbnail((self.settings.max_image_side, self.settings.max_image_side), Image.Resampling.LANCZOS)
            resized_size = image_for_save.size
            suffix = local_path.suffix.lower() or ".jpg"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_path = Path(temp_file.name)
            image_for_save.save(temp_path)
            return temp_path, original_size, resized_size

    def _is_remove_bg_busy_error(self, error: TudingAIError) -> bool:
        return "您有任务正在执行中，请稍后再提交" in str(error)

    def _wait_for_remove_bg_slot(self, interval_seconds: float = 5.0, max_attempts: int = 6) -> None:
        for _ in range(max_attempts):
            time.sleep(interval_seconds)

    def _submit_remove_bg(self, images: list[dict[str, Any]], border: int, retry_attempts: int = 6, retry_interval_seconds: float = 5.0) -> dict[str, Any]:
        payload = {
            "imageList": [
                {"image": item["image"], "width": item["width"], "height": item["height"]}
                for item in images
            ],
            "batchSize": len(images),
            "border": border,
        }
        last_error: TudingAIError | None = None
        for attempt in range(retry_attempts):
            try:
                return self.api_request("POST", "/ps/plugin/removeBg", json_body=payload)
            except TudingAIError as error:
                if not self._is_remove_bg_busy_error(error):
                    raise
                last_error = error
                if attempt < retry_attempts - 1:
                    time.sleep(retry_interval_seconds)
        if last_error is not None:
            raise last_error
        raise TudingAIError("removeBg 提交失败")

    def remove_bg_single(self, image_url: str, width: int, height: int, border: int = 2) -> str:
        data = self._submit_remove_bg([{"image": image_url, "width": width, "height": height}], border=border)
        task_id = data.get("data")
        if not task_id:
            raise TudingAIError(f"removeBg 返回异常: {data}")
        return task_id

    def remove_bg_batch(self, images: list[dict[str, Any]], border: int = 2) -> str:
        data = self._submit_remove_bg(images, border=border)
        task_id = data.get("data")
        if not task_id:
            raise TudingAIError(f"批量 removeBg 返回异常: {data}")
        return task_id

    def task_detail(self, task_id: str) -> dict[str, Any]:
        data = self.api_request(
            "POST",
            "/ps/plugin/taskDetailList",
            json_body={"taskIdList": [task_id]},
        )
        items = data.get("data") or []
        if not items:
            raise TudingAIError("taskDetailList 返回为空")
        return items[0]

    @staticmethod
    def _parse_task_result_str(task_result_str: str) -> dict[str, Any]:
        try:
            result_items = json.loads(task_result_str or "[]")
            if isinstance(result_items, list) and result_items:
                return result_items[0]
        except Exception:
            pass
        return {}

    def poll_single_task_result(self, task_id: str, interval_seconds: float = 1.5, max_attempts: int = 40) -> dict[str, Any]:
        for _ in range(max_attempts):
            detail = self.task_detail(task_id)
            parsed = self._parse_task_result_str(detail.get("taskResult", ""))
            if detail.get("taskStatus") == 1 and parsed.get("status") == 1 and parsed.get("result"):
                result_url = parsed.get("result")
                if result_url and not result_url.startswith(("http://", "https://")):
                    result_url = f"https://aicdn.feilianyun.cn{result_url}" if result_url.startswith("/") else f"https://aicdn.feilianyun.cn/{result_url}"
                return {
                    "task_id": detail.get("taskId"),
                    "image": detail.get("image"),
                    "result_url": result_url,
                    "raw": detail,
                }
            time.sleep(interval_seconds)
        self._wait_for_remove_bg_slot()
        raise TudingAIError(f"单图任务超时: {task_id}")

    def flatten_batch_task(self, detail: dict[str, Any]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        parent_result = self._parse_task_result_str(detail.get("taskResult", ""))
        parent_result_url = parent_result.get("result")
        if parent_result_url and not parent_result_url.startswith(("http://", "https://")):
            parent_result_url = f"https://aicdn.feilianyun.cn{parent_result_url}" if parent_result_url.startswith("/") else f"https://aicdn.feilianyun.cn/{parent_result_url}"
        items.append({
            "image": detail.get("image"),
            "task_id": detail.get("taskId"),
            "task_status": detail.get("taskStatus"),
            "result_status": parent_result.get("status"),
            "result_url": parent_result_url,
            "is_parent": True,
        })
        for sub_task in detail.get("subTaskList", []) or []:
            sub_result = self._parse_task_result_str(sub_task.get("taskResult", ""))
            sub_result_url = sub_result.get("result")
            if sub_result_url and not sub_result_url.startswith(("http://", "https://")):
                sub_result_url = f"https://aicdn.feilianyun.cn{sub_result_url}" if sub_result_url.startswith("/") else f"https://aicdn.feilianyun.cn/{sub_result_url}"
            items.append({
                "image": sub_task.get("image"),
                "task_id": sub_task.get("taskId"),
                "task_status": sub_task.get("taskStatus"),
                "result_status": sub_result.get("status"),
                "result_url": sub_result_url,
                "is_parent": False,
            })
        return items

    def poll_batch_task_result(self, parent_task_id: str, expected_count: int, interval_seconds: float = 1.5, max_attempts: int = 60) -> list[dict[str, Any]]:
        for _ in range(max_attempts):
            detail = self.task_detail(parent_task_id)
            items = self.flatten_batch_task(detail)
            completed = [
                item for item in items
                if item.get("task_status") == 1 and item.get("result_status") == 1 and item.get("result_url")
            ]
            if len(completed) >= expected_count:
                self._wait_for_remove_bg_slot()
                return completed[:expected_count]
            time.sleep(interval_seconds)
        self._wait_for_remove_bg_slot()
        raise TudingAIError(f"批量任务超时: {parent_task_id}")

    @staticmethod
    def download_file(url: str, save_path: Path, retry_attempts: int = 8, retry_interval_seconds: float = 5.0) -> None:
        last_error: Exception | None = None
        for attempt in range(retry_attempts):
            response: requests.Response | None = None
            try:
                response = requests.get(url, stream=True, timeout=120)
                response.raise_for_status()
                save_path.parent.mkdir(parents=True, exist_ok=True)
                temp_path = save_path.with_suffix(f"{save_path.suffix}.tmp")
                with open(temp_path, "wb") as file:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            file.write(chunk)
                temp_path.replace(save_path)
                return
            except requests.RequestException as error:
                last_error = error
                if attempt < retry_attempts - 1:
                    time.sleep(retry_interval_seconds * (attempt + 1))
            finally:
                if response is not None:
                    response.close()
        if last_error is not None:
            raise TudingAIError("扣图结果已生成，但 CDN 下载暂时超时，请稍后重新处理该图片") from last_error
        raise TudingAIError("扣图结果下载失败，请稍后重新处理该图片")