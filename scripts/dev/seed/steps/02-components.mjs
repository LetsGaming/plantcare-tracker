const FINENESS = { coarse: 1, medium: 2, fine: 3 };

const COMPONENTS = [
  ["Perlite", "coarse"],
  ["Pine bark", "medium"],
  ["Coco coir", "fine"],
  ["Pumice", "coarse"],
  ["Zeolite", "medium"],
  ["Sphagnum moss", "fine"],
  ["Orchid bark", "coarse"],
  ["Leca", "medium"],
  ["Worm castings", "fine"],
];

export default {
  name: "components",
  async run(ctx) {
    ctx.state.components = {};
    for (const [name, fineness] of COMPONENTS) {
      const created = await ctx.call("POST", "/components", {
        token: ctx.token("admin"),
        json: { name, fineness: FINENESS[fineness] },
      });
      ctx.state.components[name] = created.component_id;
    }
  },
};
