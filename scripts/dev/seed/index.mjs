/**
 * Seeds a running dev backend through its real HTTP API, so derived state (ownership, image
 * pipeline, health rows) is produced by the application itself.
 *
 * To cover a new feature: add `steps/NN-name.mjs` exporting `{ name, run(ctx) }` and list it below.
 * Steps run in order and hand ids to later steps through `ctx.state`. Keep a step's data in the
 * step file; a new screen without seeded data is untested by every later dev-up.
 */
import users from "./steps/01-users.mjs";
import components from "./steps/02-components.mjs";
import substrates from "./steps/03-substrates.mjs";
import plants from "./steps/04-plants.mjs";
import watering from "./steps/05-watering.mjs";
import images from "./steps/06-images.mjs";
import scraperHealth from "./steps/07-scraper-health.mjs";

export const STEPS = [users, components, substrates, plants, watering, images, scraperHealth];

export const runSeed = async (ctx) => {
  for (const step of STEPS) {
    ctx.log(`seeding ${step.name}`);
    await step.run(ctx);
  }
};
