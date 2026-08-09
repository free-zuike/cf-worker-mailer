import { request } from '../request';

export interface Contact {
  id: string;
  userId: string;
  name: string;
  email: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export function fetchContacts() {
  return request<{ contacts: Contact[] }>({ url: '/contacts' });
}

export function createContact(data: { name: string; email: string; remark?: string }) {
  return request<{ contact: Contact }>({ url: '/contacts', method: 'post', data });
}

export function updateContact(id: string, data: { name: string; email: string; remark?: string }) {
  return request<{ contact: Contact }>({ url: `/contacts/${id}`, method: 'put', data });
}

export function deleteContact(id: string) {
  return request<{ success: boolean }>({ url: `/contacts/${id}`, method: 'delete' });
}