import type { AxiosResponse } from 'axios';
import { createFlatRequest } from '@sa/axios';
import { useAuthStore } from '@/store/modules/auth';
import { localStg } from '@/utils/storage';
import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization, handleExpiredRequest, showErrorMsg } from './shared';
import type { RequestInstanceState } from './type';

const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
const { baseURL, otherBaseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

export const request = createFlatRequest(
  {
    baseURL,
    headers: {}
  },
  {
    defaultState: {
      errMsgStack: [],
      refreshTokenPromise: null
    } as RequestInstanceState,
    /** Workers API 响应直接返回数据，无需做 data.data 解构 */
    transform(response: AxiosResponse) {
      return response.data;
    },
    /** 注入 Authorization 请求头 */
    async onRequest(config) {
      const Authorization = getAuthorization();
      Object.assign(config.headers, { Authorization });
      return config;
    },
    /** Workers API 使用 HTTP 状态码表示成功/失败，收到响应即视为业务成功 */
    isBackendSuccess() {
      return true;
    },
    async onBackendFail(_response, _instance) {
      return null;
    },
    onError(error) {
      const authStore = useAuthStore();

      let message = error.message;

      // HTTP 401：token 过期或未授权，尝试刷新 token
      if (error.response?.status === 401) {
        const refreshToken = localStg.get('refreshToken');
        if (refreshToken) {
          handleExpiredRequest(request.state);
        } else {
          authStore.resetStore();
        }
        return;
      }

      // 从响应中提取错误消息
      if (error.response?.data?.error) {
        message = error.response.data.error;
      }

      showErrorMsg(request.state, message);
    }
  }
);