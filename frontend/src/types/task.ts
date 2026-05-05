export type TaskStatus = 'pending' | 'processing' | 'paused' | 'done' | 'failed';
export type TaskItemStatus = 'pending' | 'uploading' | 'submitted' | 'processing' | 'paused' | 'done' | 'failed';
export type TaskMode = 'single' | 'batch';

export interface TaskItem {
  itemId: string;
  fileKey: string;
  fileName: string;
  status: TaskItemStatus;
  message: string;
  downloadUrl: string | null;
  originalUrl: string | null;
}

export interface TaskItemRecord {
  taskId: string;
  item: TaskItem;
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

export interface TaskListResponse {
  tasks: TaskDetail[];
}

export interface ClearTasksResponse {
  deletedTasks: number;
  deletedFiles: number;
}

export interface DeleteTaskItemResponse {
  deletedTask: boolean;
  deletedItem: boolean;
  deletedFiles: number;
  task: TaskDetail | null;
}
