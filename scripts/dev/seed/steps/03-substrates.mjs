const SUBSTRATES = [
  {
    owner: "grower",
    name: "Aroid chunky mix",
    isPublic: true,
    parts: { "Pine bark": 3, Perlite: 2, "Coco coir": 1, "Worm castings": 0.5 },
  },
  {
    owner: "grower",
    name: "Gritty cactus mix",
    isPublic: false,
    parts: { Pumice: 3, Zeolite: 2, "Coco coir": 1 },
  },
  {
    owner: "grower",
    name: "Peat free basic",
    isPublic: true,
    parts: { "Coco coir": 4, Perlite: 1 },
  },
  {
    owner: "grower",
    name: "Moss pole filler",
    isPublic: false,
    parts: {},
  },
  {
    owner: "admin",
    name: "Orchid bark blend",
    isPublic: true,
    parts: { "Orchid bark": 4, Leca: 1, "Sphagnum moss": 1 },
  },
];

export default {
  name: "substrates",
  async run(ctx) {
    ctx.state.substrates = {};
    for (const entry of SUBSTRATES) {
      const token = ctx.token(entry.owner);
      const created = await ctx.call("POST", "/substrates", {
        token,
        json: { name: entry.name, isPublic: entry.isPublic },
      });
      const components = Object.entries(entry.parts).map(([name, parts]) => ({
        componentId: ctx.state.components[name],
        parts,
      }));
      if (components.length > 0) {
        await ctx.call("POST", `/substrates/${created.substrate_id}/components`, {
          token,
          json: { components },
        });
      }
      ctx.state.substrates[entry.name] = created.substrate_id;
    }
  },
};
