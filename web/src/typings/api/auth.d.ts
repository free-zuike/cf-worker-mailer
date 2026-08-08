declare namespace Api {
  namespace Auth {
    interface LoginToken {
      token: string;
      refreshToken: string;
      expiresAt: number;
    }

    interface UserInfo {
      id: string;
      email: string;
      role: 'user' | 'admin';
    }
  }
}