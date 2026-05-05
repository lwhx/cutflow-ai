import { useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { clearTasks, createTask, deleteTaskItem, getTask, listTasks, pauseTask, retryTaskItem } from './api/taskApi';
import LogPanel from './components/LogPanel';
import ModeSelector from './components/ModeSelector';
import TaskList from './components/TaskList';
import UploadPanel from './components/UploadPanel';
import { useObjectUrls } from './hooks/useObjectUrls';
import type { ImagePreview } from './types/preview';
import type { TaskDetail, TaskItemRecord, TaskItemStatus, TaskMode } from './types/task';
import { createUploadFileItem, extractImageFilesFromClipboardData, type UploadFileItem } from './types/upload';

export default function App() {
  const [mode, setMode] = useState<TaskMode>('single');
  const [items, setItems] = useState<UploadFileItem[]>([]);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [processedTasks, setProcessedTasks] = useState<TaskDetail[]>([]);
  const [processingFileKeys, setProcessingFileKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [restoredTaskIds, setRestoredTaskIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  const resetPreviewScale = () => {
    setPreviewScale(1);
  };

  const zoomOutPreview = () => {
    setPreviewScale((scale) => Math.max(0.5, Number((scale - 0.1).toFixed(2))));
  };

  const zoomInPreview = () => {
    setPreviewScale((scale) => Math.min(2.5, Number((scale + 0.1).toFixed(2))));
  };

  const filePreviews = useObjectUrls(items);

  const taskItemsByFileKey = useMemo(() => {
    const map = new Map<string, TaskItemRecord>();
    processedTasks.forEach((detail) => {
      detail.items.forEach((item) => {
        map.set(item.fileKey, { taskId: detail.taskId, item });
      });
    });
    if (task) {
      task.items.forEach((item) => {
        map.set(item.fileKey, { taskId: task.taskId, item });
      });
    }
    return map;
  }, [processedTasks, task]);

  const activeTaskItemStatuses: TaskItemStatus[] = ['uploading', 'submitted', 'processing'];

  const isActiveTaskItemStatus = (status: TaskItemStatus) => activeTaskItemStatuses.includes(status);

  const hasActiveTaskItems = (detail: TaskDetail) => detail.items.some((item) => isActiveTaskItemStatus(item.status));

  const shouldKeepPollingTask = (detail: TaskDetail) => detail.status === 'pending' || detail.status === 'processing' || (detail.status === 'paused' && hasActiveTaskItems(detail));

  const restoredItems = useMemo<UploadFileItem[]>(() => {
    const existingFileKeys = new Set(items.map((item) => item.fileKey));
    return processedTasks.flatMap((detail) => {
      if (!restoredTaskIds.has(detail.taskId)) {
        return [];
      }
      return detail.items
        .filter((item) => !existingFileKeys.has(item.fileKey))
        .map((item) => ({
          fileKey: item.fileKey,
          file: new File([], item.fileName, { type: 'image/png' })
        }));
    });
  }, [items, processedTasks, restoredTaskIds]);

  const displayItems = useMemo(() => [...items, ...restoredItems], [items, restoredItems]);

  const syncTaskState = (detail: TaskDetail) => {
    setTask(detail);
    setProcessedTasks((tasks) => {
      const nextTasks = tasks.filter((item) => item.taskId !== detail.taskId);
      return [...nextTasks, detail];
    });
    setProcessingFileKeys((keys) => {
      const nextKeys = new Set(keys);
      detail.items.forEach((item) => {
        if (item.status === 'done' || item.status === 'failed') {
          nextKeys.delete(item.fileKey);
        }
      });
      return nextKeys;
    });
  };

  const finishRunningTask = () => {
    setRunning(false);
    setProcessingFileKeys(new Set());
    stopPolling();
  };

  const getRunnableItems = () => {
    const handledFileKeys = new Set<string>();
    processedTasks.forEach((detail) => {
      detail.items.forEach((item) => {
        if (item.status !== 'paused') {
          handledFileKeys.add(item.fileKey);
        }
      });
    });
    processingFileKeys.forEach((fileKey) => handledFileKeys.add(fileKey));
    return items.filter((item) => !handledFileKeys.has(item.fileKey));
  };

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
      syncTaskState(detail);
      if (shouldKeepPollingTask(detail)) {
        return;
      }
      finishRunningTask();
    }, 1500);
  };

  const handleItemsChange = (nextItems: UploadFileItem[]) => {
    setItems(nextItems);
    setError('');
  };

  const appendImageFiles = (nextFiles: File[]) => {
    const map = new Map<string, UploadFileItem>();
    items.forEach((item) => map.set(`${item.file.name}_${item.file.size}_${item.file.lastModified}`, item));
    nextFiles.forEach((file) => map.set(`${file.name}_${file.size}_${file.lastModified}`, createUploadFileItem(file)));
    handleItemsChange(Array.from(map.values()));
  };

  const handleRemoveFile = async (index: number) => {
    const target = displayItems[index];
    if (!target) {
      return;
    }
    const taskItemRecord = taskItemsByFileKey.get(target.fileKey);
    if (restoredItems.some((item) => item.fileKey === target.fileKey) && taskItemRecord) {
      try {
        const result = await deleteTaskItem(taskItemRecord.taskId, taskItemRecord.item.itemId);
        setProcessedTasks((tasks) => {
          if (result.deletedTask || !result.task) {
            return tasks.filter((detail) => detail.taskId !== taskItemRecord.taskId);
          }
          return tasks.map((detail) => detail.taskId === result.task?.taskId ? result.task : detail);
        });
        setRestoredTaskIds((taskIds) => {
          const nextTaskIds = new Set(taskIds);
          if (result.deletedTask) {
            nextTaskIds.delete(taskItemRecord.taskId);
          }
          return nextTaskIds;
        });
        if (task?.taskId === taskItemRecord.taskId) {
          setTask(result.task);
        }
      } catch (requestError) {
        const errorMessage = requestError instanceof AxiosError
          ? requestError.response?.data?.detail || requestError.message
          : '删除历史图片失败';
        setError(String(errorMessage));
      }
      return;
    }
    const itemIndex = items.findIndex((item) => item.fileKey === target.fileKey);
    if (itemIndex < 0) {
      return;
    }
    if (processingFileKeys.has(target.fileKey)) {
      return;
    }
    handleItemsChange(items.filter((_, currentIndex) => currentIndex !== itemIndex));
  };

  const handleClearFiles = () => {
    if (running) {
      setItems(items.filter((item) => processingFileKeys.has(item.fileKey)));
      return;
    }
    handleItemsChange([]);
    setTask(null);
    setProcessedTasks([]);
    setRestoredTaskIds(new Set());
    setProcessingFileKeys(new Set());
  };

  const handleClearHistory = async () => {
    if (running) {
      setError('任务处理中，请完成或暂停后再清理历史任务');
      return;
    }
    try {
      const result = await clearTasks();
      handleItemsChange([]);
      setTask(null);
      setProcessedTasks([]);
      setRestoredTaskIds(new Set());
      setProcessingFileKeys(new Set());
      setPreview(null);
      setError(`已清理 ${result.deletedTasks} 个历史任务，删除 ${result.deletedFiles} 个文件`);
    } catch (requestError) {
      const errorMessage = requestError instanceof AxiosError
        ? requestError.response?.data?.detail || requestError.message
        : '清理历史任务失败';
      setError(String(errorMessage));
    }
  };

  const handleStart = async () => {
    const runnableItems = getRunnableItems();
    if (runnableItems.length === 0) {
      setError(items.length === 0 ? '请先选择图片' : '当前没有需要处理的新图片');
      return;
    }
    setError('');
    setRunning(true);
    setProcessingFileKeys(new Set(runnableItems.map((item) => item.fileKey)));
    try {
      const created = await createTask(runnableItems, mode, 2);
      const detail = await getTask(created.taskId);
      syncTaskState(detail);
      startPolling(created.taskId);
    } catch (requestError) {
      const errorMessage = requestError instanceof AxiosError
        ? requestError.response?.data?.detail || requestError.message
        : '创建任务失败';
      setError(String(errorMessage));
      setRunning(false);
      setProcessingFileKeys(new Set());
    }
  };

  const handlePause = async () => {
    if (!task || !running) {
      return;
    }
    try {
      const detail = await pauseTask(task.taskId);
      syncTaskState(detail);
      if (shouldKeepPollingTask(detail)) {
        return;
      }
      finishRunningTask();
    } catch (requestError) {
      const errorMessage = requestError instanceof AxiosError
        ? requestError.response?.data?.detail || requestError.message
        : '暂停任务失败';
      setError(String(errorMessage));
    }
  };

  const handleRetryItem = async (taskId: string, itemId: string) => {
    setError('');
    setRunning(true);
    try {
      const detail = await retryTaskItem(taskId, itemId, 2);
      syncTaskState(detail);
      startPolling(taskId);
    } catch (requestError) {
      const errorMessage = requestError instanceof AxiosError
        ? requestError.response?.data?.detail || requestError.message
        : '重新处理失败';
      setError(String(errorMessage));
      setRunning(false);
    }
  };

  useEffect(() => {
    const restoreTasks = async () => {
      try {
        const response = await listTasks();
        const restorableTasks = response.tasks.filter((detail) => detail.items.length > 0);
        if (restorableTasks.length === 0) {
          return;
        }
        setProcessedTasks(restorableTasks);
        setTask(restorableTasks[0]);
        setRestoredTaskIds(new Set(restorableTasks.map((detail) => detail.taskId)));
      } catch (requestError) {
        const errorMessage = requestError instanceof AxiosError
          ? requestError.response?.data?.detail || requestError.message
          : '恢复历史任务失败';
        setError(String(errorMessage));
      }
    };
    restoreTasks();
  }, []);

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
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
  }, [items]);

  useEffect(() => {
    if (!preview) {
      setPreviewScale(1);
      document.body.style.overflow = '';
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null);
      }
      if (event.key === '=' || event.key === '+') {
        zoomInPreview();
      }
      if (event.key === '-') {
        zoomOutPreview();
      }
      if (event.key === '0') {
        resetPreviewScale();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [preview]);

  return (
    <>
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
            <span>{displayItems.length > 0 ? `已准备 ${displayItems.length} 张图片` : '等待上传图片'}</span>
            <div className="hero-action-buttons">
              <button disabled={running || getRunnableItems().length === 0} onClick={handleStart} type="button">
                {running ? '正在处理...' : '开始智能扣图'}
              </button>
              <button className="pause-button" disabled={!running || !task} onClick={handlePause} type="button">
                暂停
              </button>
              <button className="danger-button" disabled={running || processedTasks.length === 0} onClick={handleClearHistory} type="button">
                清理历史任务
              </button>
            </div>
          </div>
        </header>
        {error && <div className="error-alert">{error}</div>}
        <div className="grid">
          <aside className="left-column">
            <ModeSelector mode={mode} onChange={setMode} />
            <UploadPanel items={items} onClear={handleClearFiles} onItemsChange={handleItemsChange} />
          </aside>
          <section className="right-column" aria-label="处理结果">
            <TaskList disabled={running} items={displayItems} onPreview={setPreview} onRemoveFile={handleRemoveFile} onRetryItem={handleRetryItem} previewUrls={filePreviews} task={task} taskItemsByFileKey={taskItemsByFileKey} />

            <LogPanel logs={task?.logs || []} />
          </section>
        </div>
      </main>
      {preview && (
        <div className="preview-overlay" onClick={() => setPreview(null)} role="presentation">
          <div className="preview-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="图片预览">
            <div className="preview-header">
              <div>
                <p className="preview-label">VIEWER</p>
                <strong>{preview.title}</strong>
                <span>{preview.kind}</span>
              </div>
              <div className="preview-toolbar">
                <button className="secondary-button" onClick={resetPreviewScale} type="button">适应窗口</button>
                <button className="secondary-button" onClick={zoomOutPreview} type="button">缩小</button>
                <button className="secondary-button" onClick={zoomInPreview} type="button">放大</button>
                <button className="secondary-button" onClick={() => setPreview(null)} type="button">关闭</button>
              </div>
            </div>
            <div className="preview-stage">
              <div className="preview-frame" style={{ transform: `scale(${previewScale})` }}>
                <img alt={preview.title} src={preview.src} />
              </div>
            </div>
            <div className="preview-footer">
              <span>缩放 {Math.round(previewScale * 100)}%</span>
              {preview.downloadUrl && (
                <a className="primary-link-button" download href={preview.downloadUrl}>下载 PNG</a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
