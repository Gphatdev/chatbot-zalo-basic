/**
 * Handlers/HandleUndo.js
 * Nhận event "undo" thật từ zca-mt (xem models/Undo.d.ts) — xảy ra khi ai
 * đó thu hồi một tin nhắn đã gửi trước đó.
 */
function createHandleUndo(logger) {
  return async function handleUndo(undo) {
    logger.debug("[HandleUndo] Tin nhắn đã bị thu hồi:", {
      threadId: undo?.threadId,
      msgId: undo?.data?.msgId,
    });
  };
}

export { createHandleUndo };
