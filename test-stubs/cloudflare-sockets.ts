// vitest 打桩：cloudflare:sockets 在 Node 测试环境中不存在
// 测试不会真正建立 socket 连接，仅提供类型与抛错行为
export const connect = () => {
  throw new Error('cloudflare:sockets.connect() is not available in test environment');
};