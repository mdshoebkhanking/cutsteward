import { useSyncExternalStore } from "react";

export type AppRoute =
  | { kind: "home" }
  | { kind: "runs" }
  | { kind: "run"; runId: string }
  | { kind: "artifacts" }
  | { kind: "settings" }
  | { kind: "missing" };

const runRoutePattern = /^\/runs\/([^/]+)\/?$/;

function decodeRouteSegment(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return decoded && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
}

export function resolveAppRoute(pathname: string): AppRoute {
  if (pathname === "/") return { kind: "home" };
  if (pathname === "/runs" || pathname === "/runs/") return { kind: "runs" };
  if (pathname === "/artifacts" || pathname === "/artifacts/") return { kind: "artifacts" };
  if (pathname === "/settings" || pathname === "/settings/") return { kind: "settings" };

  const runMatch = pathname.match(runRoutePattern);
  const runId = runMatch ? decodeRouteSegment(runMatch[1]) : null;
  return runId ? { kind: "run", runId } : { kind: "missing" };
}

const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};

const getSnapshot = () => window.location.pathname;

export function usePathname() {
  return useSyncExternalStore(subscribe, getSnapshot, () => "/");
}

export function navigate(pathname: string) {
  if (window.location.pathname === pathname) return;
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
