const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(message, type = "info", scope = "global") {
  let msg = message;
  let t = type;
  let sc = scope;

  if (typeof message === "object" && message !== null) {
    msg = message.message;
    t = message.type || "info";
    sc = message.scope || "global";
  }

  listeners.forEach((fn) =>
    fn({ id: Date.now() + Math.random(), message: msg, type: t, scope: sc })
  );
}

toast.success = (m, scope = "global") => toast(m, "success", scope);
toast.error = (m, scope = "global") => toast(m, "error", scope);

export default toast;
