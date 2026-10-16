const latestBody = new WeakMap<object, unknown>();

export function rememberHttpErrorBody(client: object, body: unknown): void {
  latestBody.set(client, body);
}

export function takeHttpErrorBody(client: object): unknown {
  const body = latestBody.get(client);
  latestBody.delete(client);
  return body;
}

export function forgetHttpErrorBody(client: object): void {
  latestBody.delete(client);
}

/** Parsed JSON when the response is JSON, otherwise the raw text. Empty text is omitted. */
export function parseHttpErrorBody(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return text;
  }
}

export async function captureHttpErrorBody(
  client: object,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  baseFetch: typeof fetch = globalThis.fetch,
): Promise<Response> {
  forgetHttpErrorBody(client);
  const response = await baseFetch(input, init);
  if (!response.ok) {
    const text = await response.clone().text().catch(() => "");
    const body = parseHttpErrorBody(text);
    if (body !== undefined) {
      rememberHttpErrorBody(client, body);
    }
  }
  return response;
}

/** Body carried on the thrown error when the HTTP response itself was not captured. */
export function errorResponseBody(error: unknown): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("body" in error && error.body !== undefined) {
    return error.body;
  }
  if ("error" in error && error.error !== undefined && !(error.error instanceof Error)) {
    return error.error;
  }
  return undefined;
}

export function formatLastError(error: unknown, body: unknown): string {
  if (typeof body === "string" && body.trim().length > 0) {
    return body.trim();
  }
  if (body !== undefined && body !== null && typeof body !== "string") {
    return JSON.stringify(body);
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}
