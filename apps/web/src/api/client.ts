export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(`API request failed (${status})`);
    this.name = "ApiError";
  }
}

export function accessDenied(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    expectedUserId?: string;
  } = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body !== undefined && { "Content-Type": "application/json" }),
      ...(options.expectedUserId !== undefined && { "X-Expected-User-Id": options.expectedUserId }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const conflict =
      response.status === 409 ? await response.json().catch(() => undefined) : undefined;
    throw new ApiError(response.status, conflict);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
