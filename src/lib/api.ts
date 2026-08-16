import { NextResponse } from "next/server";
import { ZodError, flattenError } from "zod";

/** An error with an intended HTTP status. Anything else becomes a 500. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Wraps a route handler so every failure returns a consistent JSON envelope
 * (`{ error, details? }`) instead of an HTML error page.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.message, details: error.details }, error.status);
      }
      if (error instanceof ZodError) {
        return json(
          { error: "Invalid request.", details: flattenError(error).fieldErrors },
          400,
        );
      }
      console.error("[api] unhandled error", error);
      return json({ error: "Something went wrong on our end." }, 500);
    }
  };
}

/** Parses a JSON body, turning malformed input into a 400 rather than a crash. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}
