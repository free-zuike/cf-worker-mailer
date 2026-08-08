import { request } from '../request';

export interface TemplateVariable {
  key: string;
  defaultValue: string;
  description?: string;
}

export interface EmailTemplate {
  id: string;
  userId: string;
  name: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  variables?: TemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateParams {
  name: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  variables?: TemplateVariable[];
}

export interface UpdateTemplateParams {
  name?: string;
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  variables?: TemplateVariable[];
}

/** 获取模板列表 */
export function fetchTemplates() {
  return request<{ templates: EmailTemplate[] }>({ url: '/templates' });
}

/** 获取单个模板 */
export function fetchTemplate(id: string) {
  return request<{ template: EmailTemplate }>({ url: `/templates/${id}` });
}

/** 创建模板 */
export function createTemplate(data: CreateTemplateParams) {
  return request<{ template: EmailTemplate }>({
    url: '/templates',
    method: 'post',
    data
  });
}

/** 更新模板 */
export function updateTemplate(id: string, data: UpdateTemplateParams) {
  return request<{ template: EmailTemplate }>({
    url: `/templates/${id}`,
    method: 'put',
    data
  });
}

/** 删除模板 */
export function deleteTemplate(id: string) {
  return request<{ success: boolean }>({
    url: `/templates/${id}`,
    method: 'delete'
  });
}