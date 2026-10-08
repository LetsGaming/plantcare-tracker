/// <reference types="node" />
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { healEnv, parseExample } from "../../scripts/ensure-env.mjs";

const example = [
  "# Header, separated by a blank line.",
  "",
  "# Address of the API.",
  "VITE_API_URL=",
  "",
  "# Name in the tab.",
  "VITE_APP_TITLE=Plantcare Tracker",
  "",
  "# Signing secret.",
  "SESSION_SECRET=",
  "",
].join("\n");

describe("healEnv", () => {
  let dir: string;
  let examplePath: string;
  let envPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-env-"));
    examplePath = path.join(dir, ".env.example");
    envPath = path.join(dir, ".env");
    fs.writeFileSync(examplePath, example);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the comments that sit directly above a key and drops detached headers", () => {
    const entries = parseExample(example);
    expect(entries.map((e) => e.key)).toEqual(["VITE_API_URL", "VITE_APP_TITLE", "SESSION_SECRET"]);
    expect(entries[0].comments).toEqual(["# Address of the API."]);
  });

  it("creates the file with defaults and generates empty secrets", () => {
    const result = healEnv({ examplePath, envPath, generateSecret: () => "generated" });
    const text = fs.readFileSync(envPath, "utf8");
    expect(result).toEqual({
      created: true,
      added: ["VITE_API_URL", "VITE_APP_TITLE", "SESSION_SECRET"],
    });
    expect(text).toContain("VITE_APP_TITLE=Plantcare Tracker");
    expect(text).toContain("SESSION_SECRET=generated");
    expect(text).toContain("# Name in the tab.");
  });

  it("appends only the missing keys and never touches existing values", () => {
    fs.writeFileSync(envPath, "VITE_API_URL=http://plants.lan.net/api/v2\nCUSTOM=1\n");
    const result = healEnv({ examplePath, envPath, generateSecret: () => "generated" });
    const text = fs.readFileSync(envPath, "utf8");
    expect(result.added).toEqual(["VITE_APP_TITLE", "SESSION_SECRET"]);
    expect(text.startsWith("VITE_API_URL=http://plants.lan.net/api/v2\nCUSTOM=1\n")).toBe(true);
    expect(text).toContain("# Added automatically from .env.example");
    expect(text.match(/VITE_API_URL=/g)).toHaveLength(1);
  });

  it("respects a key the user commented out", () => {
    fs.writeFileSync(envPath, "# VITE_APP_TITLE=Mine\nVITE_API_URL=\nSESSION_SECRET=kept\n");
    expect(healEnv({ examplePath, envPath })).toEqual({ created: false, added: [] });
    expect(fs.readFileSync(envPath, "utf8")).toBe(
      "# VITE_APP_TITLE=Mine\nVITE_API_URL=\nSESSION_SECRET=kept\n",
    );
  });

  it("changes nothing when the file is complete and keeps CRLF line endings", () => {
    fs.writeFileSync(envPath, "VITE_API_URL=\r\nVITE_APP_TITLE=X\r\n");
    const result = healEnv({ examplePath, envPath, generateSecret: () => "s" });
    const text = fs.readFileSync(envPath, "utf8");
    expect(result.added).toEqual(["SESSION_SECRET"]);
    expect(text).toContain("SESSION_SECRET=s\r\n");
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(healEnv({ examplePath, envPath })).toEqual({ created: false, added: [] });
  });

  it("does nothing without an example file", () => {
    fs.rmSync(examplePath);
    expect(healEnv({ examplePath, envPath })).toEqual({ created: false, added: [] });
    expect(fs.existsSync(envPath)).toBe(false);
  });
});
