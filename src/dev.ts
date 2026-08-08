/**
 * Haki deweloperskie dla e2e (playwright czyta window.__strzala).
 * Aktywne wyłącznie w trybie DEV (vite) — build produkcyjny nic nie zapisuje.
 */
export function devMark(data: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __strzala?: Record<string, unknown> };
  w.__strzala = { ...(w.__strzala ?? {}), ...data };
}

/** query param w DEV (np. ?level=1-2&arena=1); null poza DEV */
export function devParam(name: string): string | null {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(window.location.search).get(name);
}
