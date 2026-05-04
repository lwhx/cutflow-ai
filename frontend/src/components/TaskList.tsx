import type { ReactNode } from 'react';
import type { TaskDetail, TaskItemStatus } from '../types/task';
import { getItemDownloadUrl, getZipDownloadUrl } from '../api/taskApi';

const statusText: Record<TaskItemStatus, string> = {
  pending: '等待处理',
  uploading: '上传中',
  submitted: '已提交',
  processing: '处理中',
  done: '已完成',
  failed: '失败'
};

interface TaskListProps {
  task: TaskDetail | null;
}

function renderDownloadLink(task: TaskDetail, itemId: string): ReactNode {
  return <a href={getItemDownloadUrl(task.taskId, itemId)}>下载</a>;
}

export default function TaskList({ task }: TaskListProps) {
  if (!task) {
    return (
      <section className="card">
        <h2>任务进度</h2>
        <p className="subtle">开始处理后，这里会显示每张图片的处理状态。</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="task-header">
        <div>
          <h2>任务进度</h2>
          <p className="subtle">任务 ID：{task.taskId}</p>
        </div>
        <div className={`status-badge ${task.status}`}>{task.status}</div>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${task.total ? ((task.completed + task.failed) / task.total) * 100 : 0}%` }} />
      </div>
      <div className="task-summary">
        <span>总数：{task.total}</span>
        <span>完成：{task.completed}</span>
        <span>失败：{task.failed}</span>
      </div>
      <div className="task-actions">
        <a className={task.completed === 0 ? 'disabled-link' : ''} href={task.completed > 0 ? getZipDownloadUrl(task.taskId) : undefined}>
          下载全部 ZIP
        </a>
      </div>
      <div className="item-table">
        {task.items.map((item) => (
          <div className="item-row" key={item.itemId}>
            <div>
              <strong>{item.fileName}</strong>
              <p>{item.message}</p>
            </div>
            <span className={`item-status ${item.status}`}>{statusText[item.status]}</span>
            {item.status === 'done' ? renderDownloadLink(task, item.itemId) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
