export const ROLES = Object.freeze({
  USER: "user",
  MENTOR: "mentor",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
});

export const ADMIN_ROLES = Object.freeze([ROLES.ADMIN, ROLES.SUPER_ADMIN]);

export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.USER]: 1,
  [ROLES.MENTOR]: 2,
  [ROLES.ADMIN]: 5,
  [ROLES.SUPER_ADMIN]: 10,
});

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}
