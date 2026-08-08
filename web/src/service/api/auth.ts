import { request } from '../request';

/** 登录响应 */
interface LoginResponse {
  user: Api.Auth.UserInfo;
  token: Api.Auth.LoginToken;
}

/** 登录 */
export function fetchLogin(email: string, password: string, captchaToken?: string) {
  return request<LoginResponse>({
    url: '/auth/login',
    method: 'post',
    data: { email, password, captchaToken }
  });
}

/** 注册 */
export function fetchRegister(email: string, password: string, captchaToken?: string) {
  return request<LoginResponse>({
    url: '/auth/register',
    method: 'post',
    data: { email, password, captchaToken }
  });
}

/** 获取当前用户信息 */
export function fetchGetUserInfo() {
  return request<{ user: Api.Auth.UserInfo }>({ url: '/auth/me' });
}

/** 刷新 token */
export function fetchRefreshToken(refreshToken: string) {
  return request<{ user: Api.Auth.UserInfo; token: Api.Auth.LoginToken }>({
    url: '/auth/refresh',
    method: 'post',
    data: { refreshToken }
  });
}