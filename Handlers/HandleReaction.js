/**
 * Handlers/HandleReaction.js
 * Nhận event "reaction" thật từ zca-mt (xem models/Reaction.d.ts).
 * Hiện tại chỉ log ở mức debug; các command nền có thể mở rộng sau này
 * bằng cách đăng ký thêm hook riêng nếu cần (không bắt buộc trong bản này).
 */
function createHandleReaction(logger) {
  return async function handleReaction(reaction) {
    logger.debug("[HandleReaction] Nhận reaction:", {
      threadId: reaction?.threadId,
      icon: reaction?.data?.rIcon,
    });
  };
}

export { createHandleReaction };
