/** Names double as test hooks for the mocked guide stream: "Failing Fern" ends its stream with an
 *  error, "Unknown Orchid" has no external link. Unicode and long names exercise layout. */
const PLANTS = [
  { owner: "grower", name: "Monty", species: "Monstera deliciosa", substrate: "Aroid chunky mix", isPublic: true },
  { owner: "grower", name: "Pink Princess", species: "Philodendron erubescens", substrate: "Aroid chunky mix", isPublic: true },
  { owner: "grower", name: "Spike", species: "Echinocactus grusonii", substrate: "Gritty cactus mix", isPublic: false },
  { owner: "grower", name: "Gummibaum Ünal", species: "Ficus elastica", substrate: "Peat free basic", isPublic: false },
  { owner: "grower", name: "Failing Fern", species: "Nephrolepis exaltata", substrate: "Peat free basic", isPublic: true },
  { owner: "grower", name: "Unknown Orchid", species: "Phalaenopsis", substrate: "Orchid bark blend", isPublic: false },
  {
    owner: "grower",
    name: "The very long named plant that keeps growing across the whole kitchen window sill",
    species: "Epipremnum aureum",
    substrate: "Aroid chunky mix",
    isPublic: true,
  },
  { owner: "admin", name: "Office Hoya", species: "Hoya kerrii", substrate: "Orchid bark blend", isPublic: true },
];

export default {
  name: "plants",
  async run(ctx) {
    ctx.state.plants = {};
    for (const plant of PLANTS) {
      const created = await ctx.call("POST", "/plants", {
        token: ctx.token(plant.owner),
        json: {
          name: plant.name,
          species: plant.species,
          substrateId: plant.substrate ? ctx.state.substrates[plant.substrate] : undefined,
          isPublic: plant.isPublic,
        },
      });
      ctx.state.plants[plant.name] = { id: created.plant_id, owner: plant.owner };
    }
  },
};
