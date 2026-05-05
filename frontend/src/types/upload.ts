export interface UploadFileItem {
  file: File;
  fileKey: string;
}

function createCompatibleRandomId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createUploadFileItem(file: File): UploadFileItem {
  return {
    file,
    fileKey: `${file.name}_${file.size}_${file.lastModified}_${createCompatibleRandomId()}`
  };
}

export function extractImageFilesFromClipboardData(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter((file) => file.type.startsWith('image/'));
  if (files.length > 0) {
    return files;
  }
  return Array.from(data.items).reduce<File[]>((images, item, index) => {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) {
      return images;
    }
    const file = item.getAsFile();
    if (!file) {
      return images;
    }
    const extension = item.type.split('/')[1] || 'png';
    const namedFile = new File([file], `paste-${Date.now()}-${index}.${extension}`, { type: item.type, lastModified: Date.now() });
    return [...images, namedFile];
  }, []);
}
