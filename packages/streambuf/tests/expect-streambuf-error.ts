import { isSeqlokError } from "@seqlok/base";
import { expect } from "vitest";

export function expectStreambufError(
  fn: () => unknown,
  code: string,
  where?: string,
): void {
  try {
    fn();
    throw new Error("Expected streambuf error");
  } catch (err: unknown) {
    if (!isSeqlokError(err)) {
      throw err;
    }

    expect(err.code).toBe(code);

    if (where !== undefined) {
      // `details` is structured, but we only care about the stable `where` string.
      const details = err.details as Record<string, unknown>;
      expect(details.where).toBe(where);
    }
  }
}
