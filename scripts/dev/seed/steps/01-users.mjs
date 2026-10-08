import { PASSWORD } from "../context.mjs";

/** admin: manages components and sees the scraper health screens.
 *  grower: owns most of the data.
 *  newbie: owns nothing, for empty states.
 *  The guest needs no account; use "continue as guest" on the login screen. */
export const USERS = [
  { username: "admin", role: "admin" },
  { username: "grower", role: "user" },
  { username: "newbie", role: "user" },
];

const ADMIN_ROLE_ID = 1;

export default {
  name: "users",
  async run(ctx) {
    for (const user of USERS) {
      await ctx.call("POST", "/auth/register", { json: { username: user.username, password: PASSWORD } });
      if (user.role === "admin") {
        ctx.sql("UPDATE users SET role_id = ? WHERE username = ?", ADMIN_ROLE_ID, user.username);
      }
      await ctx.login(user.username);
    }
  },
};
