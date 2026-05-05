export type TaskStatus = 'pending' | 'processing' | 'paused' | 'done' | 'failed';
export type TaskItemStatus = 'pending' | 'uploading' | 'submitted' | 'processing' | 'paused' | 'done' | 'failed';
export type TaskMode = 'single' | 'batch';

export interface TaskItem {
  itemId: string;
  fileKey: string;
  fileName: string;
  status: TaskItemStatus;
  message: string;
  downloadUrl?: string | null;
}

export interface TaskDetail {
  taskId: string;
  status: TaskStatus;
  mode: TaskMode;
  total: number;
  completed: number;
  failed: number;
  logs: string[];
  items: TaskItem[];
}

export interface CreateTaskResponse {
  taskId: string;
  total: number;
  status: TaskStatus;
}
