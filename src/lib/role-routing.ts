export type AppRole = "admin" | "student" | "instructor" | "super_admin" | "parent" | "outreach_officer";

const roleHomeRoutes: Record<AppRole, string> = {
  super_admin: "/super-admin",
  outreach_officer: "/outreach",
  admin: "/admin",
  instructor: "/instructor",
  parent: "/parent",
  student: "/student",
};

export function getHomeRouteForRole(role: AppRole | null | undefined) {
  return role ? roleHomeRoutes[role] : null;
}
