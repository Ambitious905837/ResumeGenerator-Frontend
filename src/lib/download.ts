import type { AxiosError } from 'axios';

/** Trigger a browser download for a blob response. */
export function saveBlob(data: BlobPart, filename: string, type?: string): void {
  const url = window.URL.createObjectURL(new Blob([data], type ? { type } : undefined));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Strip the characters Windows and Drive refuse in a file name. */
export function safeFileName(name: string, fallback = 'download'): string {
  const cleaned = (name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || fallback;
}

/**
 * An error body from a blob-typed request arrives as a Blob, not JSON — read it back
 * so the user sees the real reason instead of a generic failure.
 */
export async function blobErrorDetail(err: unknown, fallback: string): Promise<string> {
  const data = (err as AxiosError<unknown>)?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { detail?: unknown };
      if (typeof parsed.detail === 'string') return parsed.detail;
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }
  const detail = (data as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === 'string') return detail;
  return fallback;
}

/**
 * The human-readable reason a request failed.
 *
 * FastAPI answers a validation error with a *list* of `{msg}` objects rather than a
 * string; rendering that list straight into JSX throws, so it is flattened here once
 * instead of at each of the two dozen call sites.
 */
export function errorDetail(err: unknown, fallback: string): string {
  const raw = (err as AxiosError<{ detail?: unknown }>)?.response?.data?.detail;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const joined = raw
      .map((x) => (typeof x === 'string' ? x : (x as { msg?: string })?.msg ?? ''))
      .filter(Boolean)
      .join(' ');
    if (joined) return joined;
  }
  const message = (err as Error | undefined)?.message;
  return message || fallback;
}
