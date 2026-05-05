import type { ClipboardEvent, DragEvent, ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import { createUploadFileItem, extractImageFilesFromClipboardData, type UploadFileItem } from '../types/upload';

const allowedExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);

interface UploadPanelProps {
  items: UploadFileItem[];
  onItemsChange: (items: UploadFileItem[]) => void;
  onClear: () => void;
}

function FileInfo({ name, size }: { name: string; size: number }): ReactNode {
  return (
    <>
      <span>{name}</span>
      <small>{(size / 1024 / 1024).toFixed(2)} MB</small>
    </>
  );
}

export default function UploadPanel({ items, onItemsChange, onClear }: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

  const appendFiles = (nextFiles: File[]) => {
    const filtered = nextFiles.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return allowedExts.has(ext) || file.type.startsWith('image/');
    });
    const map = new Map<string, UploadFileItem>();
    items.forEach((item) => map.set(`${item.file.name}_${item.file.size}_${item.file.lastModified}`, item));
    filtered.forEach((file) => map.set(`${file.name}_${file.size}_${file.lastModified}`, createUploadFileItem(file)));
    onItemsChange(Array.from(map.values()));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    appendFiles(Array.from(event.dataTransfer.files));
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pastedImages = extractImageFilesFromClipboardData(event.clipboardData);
    if (pastedImages.length > 0) {
      event.preventDefault();
      appendFiles(pastedImages);
    }
  };

  return (
    <section className="card upload-card">
      <div className="section-title-row">
        <div>
          <h2>素材入口</h2>
          <p className="subtle">支持拖拽、点击选择和全局粘贴截图。</p>
        </div>
        <span className="mini-badge">PNG / JPG / WEBP</span>
      </div>
      <div
        className="drop-zone"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="upload-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 16V8" />
            <path d="M8.5 11.5L12 8l3.5 3.5" />
            <path d="M7 17.5h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.7 1.2A3.5 3.5 0 0 0 7 17.5Z" />
          </svg>
        </div>
        <strong>拖入图片，或直接 Ctrl + V 粘贴截图</strong>
        <div className="upload-hints" aria-label="上传方式">
          <span>点击选择</span>
          <span>拖拽上传</span>
          <span>截图粘贴</span>
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

      <div className="file-summary">
        <span>已选择 {items.length} 张图片</span>
        <div className="file-summary-actions">
          <span>{(totalSize / 1024 / 1024).toFixed(2)} MB</span>
          <button className="danger-button" disabled={items.length === 0} onClick={onClear} type="button">清空列表</button>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="file-list">
          {items.map((item) => (
            <li key={item.fileKey}>
              <FileInfo name={item.file.name} size={item.file.size} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
