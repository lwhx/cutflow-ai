import { useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { createTask, getTask } from './api/taskApi';
import LogPanel from './components/LogPanel';
import ModeSelector from './components/ModeSelector';
import TaskList from './components/TaskList';
import UploadPanel from './components/UploadPanel';
import { useObjectUrls } from './hooks/useObjectUrls';
import type { ImagePreview } from './types/preview';
import type { TaskDetail, TaskMode } from './types/task';
import { createUploadFileItem, extractImageFilesFromClipboardData, type UploadFileItem } from './types/upload';

export default function App() {
  const [mode, setMode] = useState<TaskMode>('single');
  const [items, setItems] = useState<UploadFileItem[]>([]);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const timerRef = useRef<number | null>(null);

  const filePreviews = useObjectUrls(items.map((item) => item.file));

  const stopPolling = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPolling = (taskId: string) => {
    stopPolling();
    timerRef.current = window.setInterval(async () => {
      const detail = await getTask(taskId);
      setTask(detail);
      if (detail.status === 'done' || detail.status === 'failed') {
        setRunning(false);
        stopPolling();
      }
    }, 1500);
  };

  const handleItemsChange = (nextItems: UploadFileItem[]) => {
    setItems(nextItems);
    setTask(null);
    setError('');
  };

  const appendImageFiles = (nextFiles: File[]) => {
    const map = new Map<string, UploadFileItem>();
    items.forEach((item) => map.set(`${item.file.name}_${item.file.size}_${item.file.lastModified}`, item));
    nextFiles.forEach((file) => map.set(`${file.name}_${file.size}_${file.lastModified}`, createUploadFileItem(file)));
    handleItemsChange(Array.from(map.values()));
  };

  const handleRemoveFile = (index: number) => {
    if (running) {
      return;
    }
    handleItemsChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleClearFiles = () => {
    if (running) {
      return;
    }
    handleItemsChange([]);
  };

  const handleStart = async () => {
    if (items.length === 0) {
      setError('请先选择图片');
      return;
    }
    setError('');
    setRunning(true);
    try {
      const created = await createTask(items, mode, 2);
      const detail = await getTask(created.taskId);
      setTask(detail);
      startPolling(created.taskId);
    } catch (requestError) {
      const errorMessage = requestError instanceof AxiosError
        ? requestError.response?.data?.detail || requestError.message
        : '创建任务失败';
      setError(String(errorMessage));
      setRunning(false);
    }
  };

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (running) {
        return;
      }
      if (!event.clipboardData) {
        return;
      }
      const pastedImages = extractImageFilesFromClipboardData(event.clipboardData);
      if (pastedImages.length > 0) {
        event.preventDefault();
        appendImageFiles(pastedImages);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [items, running]);

  useEffect(() => {
    if (!preview) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview]);

  return (
    <main className="page">
      <header className="hero">
        <div className="hero-content">
          <p className="eyebrow">Tuding AI Studio</p>
          <h1>透明背景，一步完成</h1>
          <p>为电商图、头像、素材图设计的 AI 扣图工作台。拖拽、粘贴或批量上传，自动生成透明 PNG。</p>
          <div className="hero-metrics" aria-label="功能特性">
            <span>支持粘贴截图</span>
            <span>批量自动分组</span>
            <span>PNG 透明预览</span>
          </div>
        </div>
        <div className="hero-actions">
          <span>{items.length > 0 ? `已准备 ${items.length} 张图片` : '等待上传图片'}</span>
          <button disabled={running || items.length === 0} onClick={handleStart} type="button">
            {running ? '正在处理...' : '开始智能扣图'}
          </button>
        </div>
      </header>
      {error && <div className="error-alert">{error}</div>}
      <div className="grid">
        <aside className="left-column">
          <ModeSelector mode={mode} onChange={setMode} />
          <UploadPanel disabled={running} items={items} onClear={handleClearFiles} onItemsChange={handleItemsChange} />
        </aside>
        <section className="right-column" aria-label="处理结果">
          <TaskList disabled={running} items={items} onPreview={setPreview} onRemoveFile={handleRemoveFile} previewUrls={filePreviews} task={task} />
          <LogPanel logs={task?.logs || []} />
        </section>
      </div>
      {preview && (
        <div className="preview-overlay" onClick={() => setPreview(null)} role="presentation">
          <div className="preview-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="图片预览">
            <div className="preview-header">
              <div>
                <strong>{preview.title}</strong>
                <span>{preview.kind}</span>
              </div>
              <button className="secondary-button" onClick={() => setPreview(null)} type="button">关闭</button>
            </div>
            <div className="preview-stage checkerboard-bg">
              <img alt={preview.title} src={preview.src} />
            </div>
            {preview.downloadUrl && (
              <a className="primary-link-button" download href={preview.downloadUrl}>下载 PNG</a>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
