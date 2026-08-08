declare module '@wangeditor/editor-for-vue' {
  import type { Component } from 'vue';
  export const Editor: Component;
  export const Toolbar: Component;
}

declare module '@wangeditor/editor' {
  export function i18nChangeLanguage(lang: string): void;
  export interface IEditorConfig {
    placeholder?: string;
    MENU_CONF?: Record<string, any>;
    [key: string]: any;
  }
  export interface IToolbarConfig {
    excludeKeys?: string[];
    toolbarKeys?: string[];
    insertKeys?: Record<string, any>;
    modalAppendToBody?: boolean;
    [key: string]: any;
  }
  export type SlateDescendant = Record<string, any>;
}