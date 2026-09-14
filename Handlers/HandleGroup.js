/**
 * Handlers/HandleGroup.js
 * Nhận event "group_event" thật từ zca-mt (xem models/GroupEvent.d.ts):
 * join, leave, remove_member, update_setting, add_admin, ... Cập nhật
 * bảng groups và chuyển tiếp cho hook nền onGroupEvent của các command.
 */
function createHandleGroup(router, db, logger) {
  return async function handleGroup(event) {
    try {
      if (event?.threadId) {
        db.query(
          `INSERT INTO groups (thread_id, name, first_seen, last_seen)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(thread_id) DO UPDATE SET last_seen = excluded.last_seen`,
          [event.threadId, event?.data?.groupName || "", Date.now(), Date.now()],
        );
      }
    } catch (err) {
      logger.error("[HandleGroup] Lỗi khi ghi group vào DB:", { message: err?.message });
    }

    await router.runBackgroundGroupHooks(event);
  };
}

export { createHandleGroup };
