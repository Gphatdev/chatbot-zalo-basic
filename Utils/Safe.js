/**
 * Utils/Safe.js
 *
 * Tiện ích bọc lỗi để một handler/command lỗi không làm sập toàn bộ bot.
 */

/**
 * Bọc một event handler (đồng bộ hoặc async) để bắt cả lỗi throw và
 * Promise rejection. Lỗi được log qua logger đã che dữ liệu nhạy cảm,
 * không được nuốt hoàn toàn (silent swallow).
 *
 * @param {string} name Tên handler, dùng để log.
 * @param {(...args: any[]) => any} handler
 * @param {{ error: (...a:any[]) => void }} logger
 */
function safeHandler(name, handler, logger) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      logger.error(`[Handler:${name}] Lỗi không mong muốn:`, {
        message: err?.message ?? String(err),
      });
    }
  };
}

/**
 * Chạy một hàm async, không cho lỗi lan ra ngoài. Trả về [error, result].
 */
async function safeRun(fn) {
  try {
    const result = await fn();
    return [null, result];
  } catch (err) {
    return [err, null];
  }
}

export { safeHandler, safeRun };
