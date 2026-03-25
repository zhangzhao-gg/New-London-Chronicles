export function navigateTo(url: string, options?: { replace?: boolean }) {
  if (typeof window === "undefined") {
    return;
  }

  if (options?.replace) {
    window.location.replace(url);
    return;
  }

  window.location.assign(url);
}
