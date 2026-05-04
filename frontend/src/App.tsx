import { useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { createTask, getTask } from './api/taskApi';
import LogPanel from './components/LogPanel';
import ModeSelector from './components/ModeSelector';
import TaskList from './components/TaskList';
import UploadPanel from './components/UploadPanel';
import type { TaskDetail, TaskMode } from './types/task';

export default function App() {
  const [mode, setMode] = useState<TaskMode>('single');
  const [files, setFiles] = useState<File[]>([]);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

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

  const handleStart = async () => {
    if (files.length === 0) {
      setError('请先选择图片');
      return;
    }
    setError('');
    setRunning(true);
    try {
      const created = await createTask(files, mode, 2);
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

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Tuding AI Web Client</p>
          <h1>图丁 AI 扣图工具</h1>
          <p>上传图片后自动扣图，支持单图、多图、拖拽和文件夹上传，账号密码由服务端环境变量统一管理。</p>
        </div>
        <button disabled={running || files.length === 0} onClick={handleStart} type="button">
          {running ? '处理中...' : '开始扣图'}
        </button>
      </header>
      {error && <div className="error-alert">{error}</div>}
      <div className="grid">
        <div className="left-column">
          <ModeSelector mode={mode} onChange={setMode} />
          <UploadPanel disabled={running} files={files} onFilesChange={setFiles} />
        </div>
        <div className="right-column">
          <TaskList task={task} />
          <LogPanel logs={task?.logs || []} />
        </div>
      </div>
    </main>
  );
}
