import { describe, it, expect, vi, beforeEach } from "vitest";

const dictionary: Record<string, string> = {
  "plants.title": "Plants",
  "profile.update_failed": "Profile update failed. Please try again.",
  "error.fetch_failed": "Failed to fetch {resource}.",
  "error.action_failed": "Failed to {action} {resource}.",
  "toast2.action_failed": "{resource}: that did not work. Please try again.",
  "toast2.network": "No connection.",
  "toast2.rate_limited": "Too many attempts.",
  "toast2.server": "Server problem.",
  "toast.retry": "Retry",
};

vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, string>, fallback?: string) => {
      const text = dictionary[key] ?? fallback ?? key;
      return text.replace(/\{(\w+)\}/g, (match, name) => vars?.[name] ?? match);
    },
  },
}));

import { toast } from "./helpers";
import { ApiError } from "@/utils/apiUtils";
import { classifyFailure, handleRequest, withoutErrorToasts } from "@/utils/requestFeedback";

const lastMessage = () => toast.showError.mock.calls.at(-1)![0] as string;
const swallow = () => undefined;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleRequest messages", () => {
  it("fills the resource into the specific action message", async () => {
    await expect(
      handleRequest(Promise.reject(new Error("boom")), "plants.title", "profile.update_failed"),
    ).rejects.toThrow("boom");
    expect(lastMessage()).toBe("Profile update failed. Please try again.");
  });

  it("never prints a raw placeholder for the generic action key", async () => {
    await handleRequest(
      Promise.reject(new Error("x")),
      "plants.title",
      "error.action_failed",
    ).catch(swallow);
    expect(lastMessage()).toBe("Plants: that did not work. Please try again.");
    expect(lastMessage()).not.toMatch(/\{\w+\}/);
  });

  it("falls back to the localized generic message when the action key has no text", async () => {
    await handleRequest(Promise.reject(new Error("x")), "plants.title", "image.upload").catch(
      swallow,
    );
    expect(lastMessage()).toBe("Plants: that did not work. Please try again.");
  });

  it("uses the fetch message by default", async () => {
    await handleRequest(Promise.reject(new Error("x")), "plants.title").catch(swallow);
    expect(lastMessage()).toBe("Failed to fetch Plants.");
  });

  it("explains network, rate limit and server failures", async () => {
    await handleRequest(Promise.reject(new TypeError("Failed to fetch")), "plants.title").catch(
      swallow,
    );
    expect(lastMessage()).toBe("No connection.");
    await handleRequest(
      Promise.reject(new ApiError(429, { error: { message: "slow down" } })),
      "plants.title",
    ).catch(swallow);
    expect(lastMessage()).toBe("Too many attempts.");
    await handleRequest(
      Promise.reject(new ApiError(503, { error: { message: "down" } })),
      "plants.title",
    ).catch(swallow);
    expect(lastMessage()).toBe("Server problem.");
  });

  it("shows the server's field problems when the user can fix them", async () => {
    const error = new ApiError(400, {
      error: { message: "Invalid", fields: { name: "Too short" } },
    });
    await handleRequest(Promise.reject(error), "plants.title", "error.action_failed").catch(
      swallow,
    );
    expect(lastMessage()).toBe("• Too short");
  });

  it("offers a retry action on request", async () => {
    const retry = vi.fn();
    await handleRequest(Promise.reject(new Error("x")), "plants.title", "error.fetch_failed", {
      retry,
    }).catch(swallow);
    const action = toast.showError.mock.calls.at(-1)![4];
    expect(action.text).toBe("Retry");
    action.handler();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("stays silent for errors the caller reports itself and inside withoutErrorToasts", async () => {
    const refreshError = Object.assign(new Error("x"), { name: "RefreshError" });
    await handleRequest(Promise.reject(refreshError), "plants.title").catch(swallow);
    await withoutErrorToasts(() =>
      handleRequest(Promise.reject(new Error("x")), "plants.title"),
    ).catch(swallow);
    expect(toast.showError).not.toHaveBeenCalled();

    await handleRequest(Promise.reject(new Error("x")), "plants.title").catch(swallow);
    expect(toast.showError).toHaveBeenCalledTimes(1);
  });

  it("resolves successful requests untouched", async () => {
    await expect(handleRequest(Promise.resolve(5), "plants.title")).resolves.toBe(5);
    expect(toast.showError).not.toHaveBeenCalled();
  });
});

describe("classifyFailure", () => {
  it("separates invalid credentials from other failures", () => {
    expect(classifyFailure(new ApiError(401, {}))).toBe("unauthorized");
    expect(classifyFailure(new ApiError(409, { error: { message: "taken" } }))).toBe("fixable");
    expect(classifyFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyFailure(new Error("x"))).toBe("other");
  });
});
