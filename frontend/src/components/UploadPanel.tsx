import type { DragEvent, ReactNode } from 'react';
import { useMemo, useRef } from 'react';

const allowedExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);

interface UploadPanelProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled: boolean;
}

function FileInfo({ name, size }: { name: string; size: number }): ReactNode {
  return (
    <>
      <span>{name}</span>
      <small>{(size / 1024 / 1024).toFixed(2)} MB</small>
    </>
  );
}

export default function UploadPanel({ files, onFilesChange, disabled }: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const appendFiles = (nextFiles: File[]) => {
    const filtered = nextFiles.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return allowedExts.has(ext);
    });
    const map = new Map<string, File>();
    [...files, ...filtered].forEach((file) => map.set(`${file.name}_${file.size}_${file.lastModified}`, file));
    onFilesChange(Array.from(map.values()));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    appendFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <section className="card upload-card">
      <div
        className={`drop-zone ${disabled ? 'disabled' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <h2>上传图片</h2>
        <p>支持点击选择、拖拽上传，也支持选择整个文件夹。</p>
        <p className="subtle">支持格式：JPG、JPEG、PNG、WEBP、BMP</p>
        <div className="upload-actions">
          <button disabled={disabled} onClick={() => fileInputRef.current?.click()} type="button">
            选择图片
          </button>
          <button disabled={disabled} onClick={() => directoryInputRef.current?.click()} type="button">
            选择文件夹
          </button>
          <button disabled={disabled || files.length === 0} onClick={() => onFilesChange([])} type="button">
            清空列表
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        accept=".jpg,.jpeg,.png,.webp,.bmp"
        multiple
        onChange={(event) => appendFiles(Array.from(event.target.files || []))}
        type="file"
        hidden
      />
      <input
        ref={directoryInputRef}
        accept=".jpg,.jpeg,.png,.webp,.bmp"
        multiple
        onChange={(event) => appendFiles(Array.from(event.target.files || []))}
        type="file"
        hidden
        {...({ webkitdirectory: '', directory: '' } as unknown as Record<string, string>)}
      />
      <div className="file-summary">
        <span>已选择 {files.length} 张图片</span>
        <span>{(totalSize / 1024 / 1024).toFixed(2)} MB</span>
      </div>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li key={`${file.name}_${file.size}_${file.lastModified}`}>
              <FileInfo name={file.name} size={file.size} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
