/** Per-event rules not stored on the Event document (yet). */
export const EVENT_CONFIG = {
  "hyderabad-founders-network-september": {
    excludeRoles: ["Student"],
  },
};

export function getExcludedRoles(eventSlug) {
  const config = EVENT_CONFIG[eventSlug];
  return Array.isArray(config?.excludeRoles) ? config.excludeRoles : [];
}

export function isRoleAllowed(eventSlug, role) {
  const trimmed = String(role || "").trim();
  if (!trimmed) return false;
  return !getExcludedRoles(eventSlug).includes(trimmed);
}
