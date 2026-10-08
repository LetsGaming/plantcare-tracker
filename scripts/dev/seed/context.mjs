import { createRequire } from "node:module";
import path from "node:path";
import { repoRoot } from "../lib/session.mjs";

export const PASSWORD = "DevPass123!";

/** Everything a seed step may use: an HTTP client for the real API, a handle for the few things
 *  the API cannot do (promoting an admin), and a registry steps use to pass ids to later steps. */
export const createContext = ({ apiUrl, dbPath, log }) => {
  const tokens = new Map();
  const state = {};

  const request = async (method, route, { token, json, form } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let body;
    if (json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    const res = await fetch(`${apiUrl}${route}`, { method, headers, body });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };

  /** Like request, but a status outside 2xx aborts the seed with a readable message. */
  const call = async (method, route, options) => {
    const res = await request(method, route, options);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${method} ${route} answered ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body?.data ?? res.body;
  };

  const sql = (statement, ...params) => {
    const require = createRequire(path.join(repoRoot, "backend", "package.json"));
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    try {
      return db.prepare(statement).run(...params);
    } finally {
      db.close();
    }
  };

  const login = async (username) => {
    const data = await call("POST", "/auth/login", { json: { username, password: PASSWORD } });
    tokens.set(username, data.accessToken);
    return data.accessToken;
  };

  return {
    apiUrl,
    log,
    state,
    request,
    call,
    sql,
    login,
    token: (username) => tokens.get(username),
  };
};
