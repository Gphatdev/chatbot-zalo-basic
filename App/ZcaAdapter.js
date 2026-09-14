import { ThreadType } from "zca-mt";

/**
 * App/ZcaAdapter.js
 *
 * Lớp adapter mỏng bọc quanh instance `API` thật của zca-mt, để phần còn lại
 * của NKNP V3 chỉ gọi một tập hàm ổn định, không phụ thuộc trực tiếp vào
 * chi tiết API của zca-mt. Mọi method dưới đây map sang đúng API thật đã
 * xác minh trong zca-mt@1.2.2 — không có method nào được bịa ra.
 *
 * Nếu một tính năng không tồn tại trong bản zca-mt hiện tại, adapter trả về
 * lỗi có kiểm soát { code: "FEATURE_UNAVAILABLE" } thay vì làm bot crash.
 */

class FeatureUnavailableError extends Error {
  constructor(featureName) {
    super(`Tính năng "${featureName}" không khả dụng trong phiên bản zca-mt hiện tại.`);
    this.code = "FEATURE_UNAVAILABLE";
    this.feature = featureName;
  }
}

function createZcaAdapter(api, logger) {
  if (!api) {
    throw new Error("[ZcaAdapter] Thiếu instance API của zca-mt.");
  }

  return {
    /**
     * [NKNP V3] Escape hatch: instance API thật của zca-mt, không qua bọc.
     * Dùng cho các command "di sản" (port từ NKNP/zca-js) vốn được viết thẳng
     * lên bề mặt API gốc (sendMessage, getUserInfo, findUser, sendCard...).
     * Command mới nên ưu tiên dùng các hàm adapter.* ở trên vì chúng có xử lý
     * lỗi an toàn (FeatureUnavailableError) — chỉ dùng .raw khi thực sự cần
     * một method chưa được bọc.
     */
    raw: api,

    /**
     * Lấy ID (uid) của chính tài khoản bot.
     * API thật: api.getOwnId() -> string
     */
    getOwnId() {
      if (typeof api.getOwnId !== "function") {
        throw new FeatureUnavailableError("getOwnId");
      }
      return api.getOwnId();
    },

    /**
     * Đăng ký các listener sự kiện và khởi động kết nối realtime.
     * API thật: api.listener là EventEmitter với các event:
     *   connected, disconnected, closed, error, message, reaction, undo,
     *   group_event, typing, ... (xem dist/apis/listen.d.ts)
     * api.listener.start({ retryOnClose }) khởi động kết nối.
     *
     * @param {{
     *   onMessage?: Function, onReaction?: Function, onUndo?: Function,
     *   onGroupEvent?: Function, onError?: Function,
     *   onConnected?: Function, onDisconnected?: Function, onClosed?: Function
     * }} handlers
     */
    startListener(handlers = {}) {
      const listener = api.listener;
      if (!listener || typeof listener.start !== "function") {
        throw new FeatureUnavailableError("startListener");
      }

      if (handlers.onMessage) listener.on("message", handlers.onMessage);
      if (handlers.onReaction) listener.on("reaction", handlers.onReaction);
      if (handlers.onUndo) listener.on("undo", handlers.onUndo);
      if (handlers.onGroupEvent) listener.on("group_event", handlers.onGroupEvent);
      if (handlers.onError) listener.on("error", handlers.onError);
      if (handlers.onConnected) listener.on("connected", handlers.onConnected);
      if (handlers.onDisconnected) listener.on("disconnected", handlers.onDisconnected);
      if (handlers.onClosed) listener.on("closed", handlers.onClosed);

      listener.start({ retryOnClose: true });
      return listener;
    },

    /**
     * Dừng listener.
     * API thật: api.listener.stop()
     */
    stopListener() {
      const listener = api.listener;
      if (!listener || typeof listener.stop !== "function") {
        throw new FeatureUnavailableError("stopListener");
      }
      listener.stop();
    },

    /**
     * Gửi tin nhắn văn bản.
     * API thật: api.sendMessage(message: MessageContent | string, threadId: string, type?: ThreadType)
     *   -> Promise<{ message: { msgId } | null, attachment: [] }>
     *
     * @param {{ threadId: string, threadType?: "user"|"group", text: string,
     *            mentions?: Array<{pos:number,uid:string,len:number}>, ttl?: number }} params
     */
    async sendText({ threadId, threadType = "group", text, mentions, ttl }) {
      if (typeof api.sendMessage !== "function") {
        throw new FeatureUnavailableError("sendText");
      }
      const type = threadType === "user" ? ThreadType.User : ThreadType.Group;
      const messageContent =
        mentions || ttl
          ? { msg: text, mentions, ttl }
          : text;
      try {
        return await api.sendMessage(messageContent, threadId, type);
      } catch (err) {
        logger.error("[ZcaAdapter] Lỗi khi gửi tin nhắn:", { message: err?.message });
        throw err;
      }
    },

    /**
     * Gửi ảnh (kèm caption text tuỳ chọn), gửi file ảnh thật thay vì gửi link.
     * API thật: api.sendMessage(message: MessageContent, threadId, type)
     *   với message.attachments = string (đường dẫn file cục bộ) hoặc mảng string.
     *   zca-mt tự đọc file, lấy metadata (cần imageMetadataGetter đã cấu hình
     *   lúc khởi tạo Zalo trong App/Session.js) rồi upload lên Zalo.
     *
     * @param {{ threadId: string, threadType?: "user"|"group",
     *            imagePath: string, message?: { text?: string } }} params
     */
    async sendImage({ threadId, threadType = "group", imagePath, message }) {
      if (typeof api.sendMessage !== "function") {
        throw new FeatureUnavailableError("sendImage");
      }
      if (!imagePath) {
        throw new Error("[ZcaAdapter] Thiếu imagePath khi gọi sendImage.");
      }
      const type = threadType === "user" ? ThreadType.User : ThreadType.Group;
      const messageContent = {
        msg: message?.text || "",
        attachments: imagePath,
      };
      try {
        return await api.sendMessage(messageContent, threadId, type);
      } catch (err) {
        logger.error("[ZcaAdapter] Lỗi khi gửi ảnh:", { message: err?.message });
        throw err;
      }
    },

    /**
     * Xóa một tin nhắn đã gửi.
     * API thật: api.deleteMessage(dest: DeleteMessageDestination, onlyMe?: boolean)
     *   dest = { data: { cliMsgId, msgId, uidFrom }, threadId, type? }
     *
     * @param {object} message Đối tượng Message nhận được từ event "message".
     * @param {boolean} onlyMe Nếu true chỉ xóa phía mình (thu hồi với mình).
     */
    async deleteMessage(message, onlyMe = false) {
      if (typeof api.deleteMessage !== "function") {
        throw new FeatureUnavailableError("deleteMessage");
      }
      const dest = {
        data: {
          cliMsgId: message.data.cliMsgId,
          msgId: message.data.msgId,
          uidFrom: message.data.uidFrom,
        },
        threadId: message.threadId,
        type: message.type,
      };
      try {
        return await api.deleteMessage(dest, onlyMe);
      } catch (err) {
        logger.error("[ZcaAdapter] Lỗi khi xóa tin nhắn:", { message: err?.message });
        throw err;
      }
    },

    /**
     * Lấy danh sách admin + chủ nhóm để CommandRouter xác minh role 1.
     * API thật: api.getGroupInfo(groupId) -> { gridInfoMap: { [id]: GroupInfo } }
     * GroupInfo.adminIds: string[], GroupInfo.creatorId: string
     * Trả về null nếu API không cung cấp đủ dữ liệu để xác minh.
     */
    async getGroupAdmins(threadId) {
      if (typeof api.getGroupInfo !== "function") {
        return null;
      }
      try {
        const res = await api.getGroupInfo(threadId);
        const info = res?.gridInfoMap?.[threadId];
        if (!info) return null;
        return {
          creatorId: info.creatorId,
          adminIds: Array.isArray(info.adminIds) ? info.adminIds : [],
        };
      } catch (err) {
        logger.warn("[ZcaAdapter] Không lấy được thông tin quản trị nhóm:", {
          message: err?.message,
        });
        return null;
      }
    },

    /**
     * Lấy thông tin đầy đủ của một nhóm cho lệnh !groupinfo.
     * API thật: api.getGroupInfo(groupId) -> { gridInfoMap: { [id]: GroupInfo } }
     */
    async getGroupInfo(threadId) {
      if (typeof api.getGroupInfo !== "function") {
        throw new FeatureUnavailableError("getGroupInfo");
      }
      try {
        const res = await api.getGroupInfo(threadId);
        return res?.gridInfoMap?.[threadId] || null;
      } catch (err) {
        logger.error("[ZcaAdapter] Không lấy được thông tin nhóm:", {
          message: err?.message,
        });
        throw err;
      }
    },

    /**
     * Kick (xóa) thành viên khỏi nhóm.
     * API thật: api.removeUserFromGroup(memberId: string | string[], groupId: string)
     *   -> Promise<{ errorMembers: string[] }>
     */
    async removeUsersFromGroup(userIds, threadId) {
      if (typeof api.removeUserFromGroup !== "function") {
        throw new FeatureUnavailableError("removeUsersFromGroup");
      }
      try {
        return await api.removeUserFromGroup(userIds, threadId);
      } catch (err) {
        logger.error("[ZcaAdapter] Lỗi khi kick thành viên:", { message: err?.message });
        throw err;
      }
    },
  };
}

export { createZcaAdapter, FeatureUnavailableError };