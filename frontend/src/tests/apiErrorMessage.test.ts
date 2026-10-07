import { describe, it, expect } from "vitest";
import { ApiError } from "@/utils/apiUtils";
import { describeUserFixableError } from "@/utils/apiErrorMessage";

describe("describeUserFixableError", () => {
  it("lists per-field problems one per line", () => {
    const error = new ApiError(400, {
      error: {
        message: "Invalid",
        fields: { password: "Password must be at least 8 characters", username: "Too short" },
      },
    });
    expect(describeUserFixableError(error)).toBe(
      "• Password must be at least 8 characters\n• Too short",
    );
  });

  it("falls back to the server message for conflicts", () => {
    const error = new ApiError(409, { error: { message: "Username already exists" } });
    expect(describeUserFixableError(error)).toBe("Username already exists");
  });

  it("ignores server failures and non-API errors", () => {
    expect(describeUserFixableError(new ApiError(500, { error: { message: "x" } }))).toBeNull();
    expect(describeUserFixableError(new Error("boom"))).toBeNull();
  });
});
