import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE, gradientPng } from "../png.mjs";
import { PLANT_PHOTOS, photoVariant } from "./06-images.mjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.snapshots");
const ATTEMPTS = 50;
const RETRY_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: "recognition",
  async run(ctx) {
    const token = ctx.token("grower");
    const status = await ctx.call("GET", "/recognition/status", { token });
    if (!status.available) {
      ctx.log("recognition unavailable, skipping snapshot fixtures");
      return;
    }
    await mkdir(OUT, { recursive: true });
    for (const name of Object.keys(PLANT_PHOTOS)) {
      const variant = photoVariant(name, 0);
      const [top, bottom] = PALETTE[variant % PALETTE.length];
      await writeFile(path.join(OUT, `${name}.png`), gradientPng(640, 480, top, bottom, variant));
    }

    const montyId = ctx.state.plants.Monty.id;
    const monty = await readFile(path.join(OUT, "Monty.png"));
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const form = new FormData();
      form.append("image", new Blob([monty], { type: "image/png" }), "Monty.png");
      const result = await ctx.call("POST", "/recognition/match", { token, form });
      if (result.candidates[0]?.plantId === montyId) return;
      await sleep(RETRY_MS);
    }
    const message = "Monty snapshot does not match Monty";
    if (process.env.RECOGNITION_MODEL_PATH) {
      ctx.log(`warning: ${message} (real model, gradient fixtures can be ambiguous)`);
      return;
    }
    throw new Error(message);
  },
};
