const DAY_MS = 24 * 60 * 60 * 1000;

/** [plant name, every N days, how many records, fertilize every Nth record (0 = never)] */
const SCHEDULES = [
  ["Monty", 6, 14, 3],
  ["Pink Princess", 5, 12, 2],
  ["Spike", 21, 4, 0],
  ["Gummibaum Ünal", 7, 10, 4],
  ["Failing Fern", 3, 20, 5],
];

export default {
  name: "watering",
  async run(ctx) {
    const now = Date.now();
    for (const [name, every, count, fertilizeEvery] of SCHEDULES) {
      const plant = ctx.state.plants[name];
      for (let i = 0; i < count; i++) {
        const fertilized = fertilizeEvery > 0 && i % fertilizeEvery === 0;
        await ctx.call("POST", `/watering/${plant.id}`, {
          token: ctx.token(plant.owner),
          json: {
            date: now - (count - i) * every * DAY_MS,
            usedFertilizer: fertilized,
            fertilizerTypeId: fertilized ? (i % 2) + 1 : null,
          },
        });
      }
    }
  },
};
