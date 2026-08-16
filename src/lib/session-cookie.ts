/**
 * The session cookie's name, on its own so `proxy.ts` can import it without
 * dragging bcrypt, jose and the database pool into the proxy bundle.
 */
export const SESSION_COOKIE = "clickrush_session";
