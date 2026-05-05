import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskDetail, TaskItem, TaskItemStatus } from '../types/task';
import { getItemDownloadUrl, getZipDownloadUrl } from '../api/taskApi';
import type { ImagePreview } from '../types/preview';
import type { UploadFileItem } from '../types/upload';

interface TaskListProps {
  task: TaskDetail | null;
  items: UploadFileItem[];
  previewUrls: string[];
  disabled: boolean;
  onRemoveFile: (index: number) => void;
  onPreview: (preview: ImagePreview) => void;
}

const statusText: Record<TaskItemStatus, string> = {
  pending: '等待处理',
  uploading: '上传中',
  submitted: '已提交',
  processing: '扣图中',
  done: '已完成',
  failed: '处理失败'
};

function formatSize(size: number): string {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function getFallbackItem(item: UploadFileItem): TaskItem {
  return {
    itemId: `local_${item.fileKey}`,
    fileKey: item.fileKey,
    fileName: item.file.name,
    status: 'pending',
    message: '等待开始处理',
    downloadUrl: null
  };
}

async function copyResultImage(url: string): Promise<'image' | 'link'> {
  const absoluteUrl = new URL(url, window.location.origin).toString();
  if ('ClipboardItem' in window && navigator.clipboard.write) {
    const response = await fetch(absoluteUrl);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return 'image';
  }
  await navigator.clipboard.writeText(absoluteUrl);
  return 'link';
}

export default function TaskList({ task, items, previewUrls, disabled, onRemoveFile, onPreview }: TaskListProps) {
  const [copyTips, setCopyTips] = useState<Record<string, string>>({});
  const copyTimerRef = useRef<number | null>(null);
  const taskItemMap = useMemo(() => new Map(task?.items.map((item) => [item.fileKey, item]) || []), [task]);
  const cards = items.map((uploadItem, index) => ({
    uploadItem,
    originalUrl: previewUrls[index],
    item: taskItemMap.get(uploadItem.fileKey) || getFallbackItem(uploadItem)
  }));

  const handleCopy = async (item: TaskItem, resultUrl: string) => {
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    try {
      const result = await copyResultImage(resultUrl);
      setCopyTips((tips) => ({ ...tips, [item.itemId]: result === 'image' ? '已复制图片' : '已复制链接' }));
    } catch {
      try {
        await navigator.clipboard.writeText(new URL(resultUrl, window.location.origin).toString());
        setCopyTips((tips) => ({ ...tips, [item.itemId]: '已复制链接' }));
      } catch {
        setCopyTips((tips) => ({ ...tips, [item.itemId]: '复制失败' }));
      }
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyTips((tips) => {
        const nextTips = { ...tips };
        delete nextTips[item.itemId];
        return nextTips;
      });
      copyTimerRef.current = null;
    }, 1800);
  };

  useEffect(() => () => {
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  if (cards.length === 0) {
    return (
      <section className="card compare-card empty-workbench">
        <div className="empty-visual" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>图片对比工作台</h2>
        <p className="subtle">上传图片后，这里会自动生成原图与扣图结果的并排对比视图。</p>
        <div className="empty-steps">
          <span>1. 上传或粘贴图片</span>
          <span>2. 点击开始智能扣图</span>
          <span>3. 预览并下载透明 PNG</span>
        </div>
      </section>
    );
  }

  return (
    <section className="card compare-card">
      <div className="task-header">
        <div>
          <span className="mini-badge">Compare Board</span>
          <h2>图片对比工作台</h2>
          <p className="subtle">{task ? `任务 ID：${task.taskId}` : '开始处理后，右侧会显示扣图结果。'}</p>
        </div>
        {task && <div className={`status-badge ${task.status}`}>{task.status}</div>}
      </div>
      {task && (
        <>
          <div className="progress-bar">
            <div style={{ width: `${task.total ? ((task.completed + task.failed) / task.total) * 100 : 0}%` }} />
          </div>
          <div className="task-summary">
            <span>总数：{task.total}</span>
            <span>完成：{task.completed}</span>
            <span>失败：{task.failed}</span>
          </div>
          <div className="task-actions">
            <a className={task.completed === 0 ? 'disabled-link' : 'primary-link-button'} href={task.completed > 0 ? getZipDownloadUrl(task.taskId) : undefined}>
              下载全部 ZIP
            </a>
          </div>
        </>
      )}
      <div className="compare-grid">
        {cards.map(({ uploadItem, originalUrl, item }, index) => {
          const resultUrl = task && item.status === 'done' ? getItemDownloadUrl(task.taskId, item.itemId) : '';
          return (
            <article className="image-compare-card" key={uploadItem.fileKey}>
              <div className="compare-card-header">
                <div>
                  <strong title={uploadItem.file.name}>{uploadItem.file.name}</strong>
                  <span>{formatSize(uploadItem.file.size)}</span>
                </div>
                <div className="compare-card-tools">
                  <span className={`item-status ${item.status}`}>{statusText[item.status]}</span>
                  <button className="danger-button" disabled={disabled} onClick={() => onRemoveFile(index)} type="button">移除</button>
                </div>
              </div>
              <div className="compare-pair">
                <button
                  className="image-tile checkerboard-bg"
                  onClick={() => onPreview({ src: originalUrl, title: uploadItem.file.name, kind: '原图' })}
                  type="button"
                >
                  <span>原图</span>
                  <img alt={`${uploadItem.file.name} 原图`} src={originalUrl} />
                </button>
                <div className="image-tile checkerboard-bg result-tile">
                  <span>扣图结果</span>
                  {item.status === 'done' && resultUrl ? (
                    <button
                      className="result-preview-button"
                      onClick={() => onPreview({ src: resultUrl, title: item.fileName, kind: '扣图结果', downloadUrl: resultUrl })}
                      type="button"
                    >
                      <img alt={`${item.fileName} 扣图结果`} src={resultUrl} />
                    </button>
                  ) : (
                    <div className={`result-placeholder ${item.status}`}>
                      <strong>{statusText[item.status]}</strong>
                      <p>{item.message}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="result-actions">
                <button disabled={!resultUrl} onClick={() => resultUrl && handleCopy(item, resultUrl)} type="button">
                  {copyTips[item.itemId] || '复制结果'}
                </button>
                <a className={!resultUrl ? 'disabled-link secondary-link-button' : 'secondary-link-button'} download href={resultUrl || undefined}>
                  下载 PNG
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
