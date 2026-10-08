/** Names double as test hooks: "Failing Fern" ends its mocked guide stream with an error, "Unknown Orchid"
 *  has no external link, the long name and the umlaut exercise layout. The watering state of each plant is
 *  set in 05-watering.mjs. */
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
  { owner: "grower", name: "Sunny Pothos", species: "Epipremnum aureum", substrate: "Peat free basic", isPublic: false },
  { owner: "grower", name: "Blue Echeveria", species: "Echeveria elegans", substrate: "Gritty cactus mix", isPublic: true },
  { owner: "grower", name: "Dracaena Dave", species: "Dracaena marginata", substrate: "Everything bagel", isPublic: false },
  { owner: "grower", name: "Calathea Cleo", species: "Calathea orbifolia", substrate: "Aroid chunky mix", isPublic: false },
  { owner: "grower", name: "Snake Plant", species: "Dracaena trifasciata", substrate: "Gritty cactus mix", isPublic: false },
  { owner: "admin", name: "Office Hoya", species: "Hoya kerrii", substrate: "Orchid bark blend", isPublic: true },
  { owner: "collector", name: "Rare Albo", species: "Monstera deliciosa", substrate: "Semi hydro starter", isPublic: true },
  { owner: "collector", name: "Collector Hoya", species: "Hoya carnosa", substrate: "Semi hydro starter", isPublic: true },
  { owner: "collector", name: "Private Treasure", species: "Anthurium veitchii", substrate: "Semi hydro starter", isPublic: false },
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
          substrateId: ctx.state.substrates[plant.substrate],
          isPublic: plant.isPublic,
        },
      });
      ctx.state.plants[plant.name] = { id: created.plant_id, owner: plant.owner };
    }
  },
};
