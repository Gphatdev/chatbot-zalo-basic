/**
 * Handlers/HandleMessage.js
 * Nhận event "message" thật từ zca-mt và chuyển cho CommandRouter xử lý.
 */
function createHandleMessage(router) {
  return async function handleMessage(message) {
    await router.handleMessage(message);
  };
}

export { createHandleMessage };
