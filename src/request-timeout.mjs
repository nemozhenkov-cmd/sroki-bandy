export const DATA_TIMEOUT_MS = 45000;

export async function withDeadline(promise, ms, message = 'Сервер не ответил вовремя. Проверьте соединение и повторите попытку.', onTimeout = () => {}) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
          onTimeout();
        }, ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function queryWithDeadline(label, query) {
  const controller = new AbortController();
  const result = await withDeadline(
    Promise.resolve(query.abortSignal(controller.signal)),
    DATA_TIMEOUT_MS,
    `${label}: сервер не ответил за 45 секунд. Проверьте соединение и повторите попытку.`,
    () => controller.abort()
  );
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}
