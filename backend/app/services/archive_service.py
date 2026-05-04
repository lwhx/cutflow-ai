import zipfile
from pathlib import Path

from app.core.config import Settings


class ArchiveServiceError(Exception):
    pass


class ArchiveService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def create_zip(self, task_id: str, result_paths: list[Path]) -> Path:
        if not result_paths:
            raise ArchiveServiceError("当前任务没有可打包的结果文件")
        archive_path = self.settings.result_dir / task_id / "remover_results.zip"
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive_file:
            for result_path in result_paths:
                archive_file.write(result_path, arcname=result_path.name)
        return archive_path
