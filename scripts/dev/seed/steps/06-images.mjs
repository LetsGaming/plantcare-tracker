import { PALETTE, gradientPng } from "../png.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Entity images: a gallery with several dated photos for some plants, one for others, none for
 *  the rest, so cards with and without images both appear. */
const PLANT_PHOTOS = {
  Monty: 4,
  "Pink Princess": 2,
  "Gummibaum Ünal": 1,
  "Office Hoya": 1,
};
const SUBSTRATE_PHOTOS = { "Aroid chunky mix": 1 };
const COMPONENT_PHOTOS = { Perlite: 1, "Pine bark": 1 };

const upload = async (ctx, token, type, id, variant, daysAgo) => {
  const [top, bottom] = PALETTE[variant % PALETTE.length];
  const png = gradientPng(640, 480, top, bottom);
  const form = new FormData();
  form.append("image", new Blob([png], { type: "image/png" }), `photo-${variant}.png`);
  await ctx.call("POST", `/images/${type}/${id}`, { token, form });
  if (daysAgo === 0) return;
  const entity = await ctx.call("GET", `/${type}s/${id}`, { token });
  const newest = entity.images[entity.images.length - 1];
  const patch = new FormData();
  patch.append("date", new Date(Date.now() - daysAgo * DAY_MS).toISOString());
  await ctx.call("PATCH", `/images/${newest.id}`, { token, form: patch });
};

export default {
  name: "images",
  async run(ctx) {
    let variant = 0;
    for (const [name, count] of Object.entries(PLANT_PHOTOS)) {
      const plant = ctx.state.plants[name];
      for (let i = 0; i < count; i++) {
        await upload(ctx, ctx.token(plant.owner), "plant", plant.id, variant++, (count - i) * 14);
      }
    }
    for (const [name, count] of Object.entries(SUBSTRATE_PHOTOS)) {
      for (let i = 0; i < count; i++) {
        await upload(ctx, ctx.token("grower"), "substrate", ctx.state.substrates[name], variant++, 0);
      }
    }
    for (const [name, count] of Object.entries(COMPONENT_PHOTOS)) {
      for (let i = 0; i < count; i++) {
        await upload(ctx, ctx.token("admin"), "component", ctx.state.components[name], variant++, 0);
      }
    }
  },
};
