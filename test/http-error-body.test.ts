import { describe, expect, it } from "vitest";
import {
  captureHttpErrorBody,
  takeHttpErrorBody,
} from "../src/agent/http-error-body.js";

describe("captureHttpErrorBody", () => {
  it("keeps the parsed HTTP error body for the client that made the request", async () => {
    const client = {};
    const response = await captureHttpErrorBody(
      client,
      "https://example.test/v1/chat/completions",
      undefined,
      (async () =>
        new Response(JSON.stringify({ error: { message: "nope", code: "bad" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    );
    expect(response.status).toBe(400);
    expect(takeHttpErrorBody(client)).toEqual({
      error: { message: "nope", code: "bad" },
    });
    expect(takeHttpErrorBody(client)).toBeUndefined();
  });

  it("leaves a successful response out of the error log", async () => {
    const client = {};
    await captureHttpErrorBody(
      client,
      "https://example.test/v1/chat/completions",
      undefined,
      (async () => new Response("{}", { status: 200 })) as typeof fetch,
    );
    expect(takeHttpErrorBody(client)).toBeUndefined();
  });
});
