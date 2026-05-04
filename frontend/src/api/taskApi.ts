import axios from 'axios';
import type { CreateTaskResponse, TaskDetail, TaskMode } from '../types/task';

const api = axios.create({
  baseURL: ''
});

export async function createTask(files: File[], mode: TaskMode, border = 2): Promise<CreateTaskResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  formData.append('mode', mode);
  formData.append('border', String(border));
  const response = await api.post<CreateTaskResponse>('/api/tasks', formData);
  return response.data;
}

export async function getTask(taskId: string): Promise<TaskDetail> {
  const response = await api.get<TaskDetail>(`/api/tasks/${taskId}`);
  return response.data;
}

export function getItemDownloadUrl(taskId: string, itemId: string): string {
  return `/api/tasks/${taskId}/items/${itemId}/download`;
}

export function getZipDownloadUrl(taskId: string): string {
  return `/api/tasks/${taskId}/download.zip`;
}
