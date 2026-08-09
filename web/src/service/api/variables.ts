import { request } from '../request';

export interface GlobalVariable {
  id: string;
  key: string;
  defaultValue: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export function fetchGlobalVariables() {
  return request<{ variables: GlobalVariable[] }>({ url: '/variables' });
}

export function createGlobalVariable(data: { key: string; defaultValue: string; description?: string }) {
  return request<{ variable: GlobalVariable }>({
    url: '/variables',
    method: 'post',
    data
  });
}

export function updateGlobalVariable(id: string, data: { key: string; defaultValue: string; description?: string }) {
  return request<{ variable: GlobalVariable }>({
    url: `/variables/${id}`,
    method: 'put',
    data
  });
}

export function deleteGlobalVariable(id: string) {
  return request<{ success: boolean }>({
    url: `/variables/${id}`,
    method: 'delete'
  });
}