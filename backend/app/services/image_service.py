import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image

from app.core.config import Settings
from app.core.constants import IMAGE_EXTS


class ImageServiceError(Exception):
    pass


class ImageService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def validate_filename(self, filename: str) -> None:
        suffix = Path(filename).suffix.lower()
        if suffix not in IMAGE_EXTS:
            raise ImageServiceError(f"不支持的图片格式: {filename}")

    def build_output_name(self, filename: str) -> str:
        path = Path(filename)
        return f"remover_{path.stem}_cut.png"

    def save_upload_file(self, task_id: str, upload_file: UploadFile) -> Path:
        filename = Path(upload_file.filename or f"image_{uuid.uuid4()}.png").name
        self.validate_filename(filename)
        task_upload_dir = self.settings.upload_dir / task_id
        task_upload_dir.mkdir(parents=True, exist_ok=True)
        save_path = task_upload_dir / f"{uuid.uuid4()}_{filename}"
        with open(save_path, "wb") as file:
            shutil.copyfileobj(upload_file.file, file)
        self.validate_image_content(save_path)
        return save_path

    def validate_image_content(self, image_path: Path) -> None:
        try:
            with Image.open(image_path) as image:
                image.verify()
        except Exception as error:
            try:
                image_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise ImageServiceError(f"图片文件无法识别: {image_path.name}") from error
