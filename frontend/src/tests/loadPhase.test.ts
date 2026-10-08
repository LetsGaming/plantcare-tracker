import { describe, it, expect } from "vitest";
import { phaseFromError } from "@/utils/loadPhase";

describe("phaseFromError", () => {
  it("maps a 404 to not-found", () => {
    expect(phaseFromError({ status: 404 })).toBe("not-found");
  });

  it("maps every other failure to error", () => {
    expect(phaseFromError({ status: 500 })).toBe("error");
    expect(phaseFromError(new Error("offline"))).toBe("error");
    expect(phaseFromError(null)).toBe("error");
  });
});
