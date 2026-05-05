import axios from 'axios';
import type { ClearTasksResponse, CreateTaskResponse, DeleteTaskItemResponse, TaskDetail, TaskListResponse, TaskMode } from '../types/task';
import type { UploadFileItem } from '../types/upload';

const api = axios.create({
  baseURL: ''
});

export async function createTask(items: UploadFileItem[], mode: TaskMode, border = 2): Promise<CreateTaskResponse> {
  const formData = new FormData();
  items.forEach((item) => {
    formData.append('files', item.file);
    formData.append('fileKeys', item.fileKey);
  });
  formData.append('mode', mode);
  formData.append('border', String(border));
  const response = await api.post<CreateTaskResponse>('/api/tasks', formData);
  return response.data;
}

export async function getTask(taskId: string): Promise<TaskDetail> {
  const response = await api.get<TaskDetail>(`/api/tasks/${taskId}`);
  return response.data;
}

export async function listTasks(): Promise<TaskListResponse> {
  const response = await api.get<TaskListResponse>('/api/tasks');
  return response.data;
}

export async function clearTasks(): Promise<ClearTasksResponse> {
  const response = await api.delete<ClearTasksResponse>('/api/tasks');
  return response.data;
}

export async function deleteTaskItem(taskId: string, itemId: string): Promise<DeleteTaskItemResponse> {
  const response = await api.delete<DeleteTaskItemResponse>(`/api/tasks/${taskId}/items/${itemId}`);
  return response.data;
}

export async function pauseTask(taskId: string): Promise<TaskDetail> {
  const response = await api.post<TaskDetail>(`/api/tasks/${taskId}/pause`);
  return response.data;
}

export function getItemDownloadUrl(taskId: string, itemId: string): string {
  return `/api/tasks/${taskId}/items/${itemId}/download`;
}

export function getZipDownloadUrl(taskId: string): string {
  return `/api/tasks/${taskId}/download.zip`;
}
