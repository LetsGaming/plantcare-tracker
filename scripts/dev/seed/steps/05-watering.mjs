const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every watering state the plant list can show. The list flags a plant as due when the days since the last
 * watering reach its own rhythm, and as overdue when it is late by more than one more rhythm. A plant with
 * fewer than two records uses a default rhythm of 7 days.
 *
 * name: [rhythm in days, number of records, days since the last watering, fertilize every Nth record]
 */
const SCHEDULES = {
  Monty: [6, 14, 1, 3], // ok
  "Pink Princess": [5, 12, 2, 2], // ok
  "Gummibaum Ünal": [7, 10, 3, 4], // ok
  "Dracaena Dave": [10, 6, 0, 0], // watered today
  "Calathea Cleo": [3, 18, 2, 5], // ok, short rhythm
  "Snake Plant": [21, 4, 9, 0], // ok, long rhythm
  "Failing Fern": [3, 20, 3, 5], // due
  Spike: [21, 4, 22, 0], // due
  "Sunny Pothos": [7, 8, 20, 4], // overdue
  "The very long named plant that keeps growing across the whole kitchen window sill": [5, 3, 16, 0], // overdue
  // Unknown Orchid and Blue Echeveria have no records: never watered.
};

export default {
  name: "watering",
  async run(ctx) {
    const now = Date.now();
    for (const [name, [every, count, lastAgo, fertilizeEvery]] of Object.entries(SCHEDULES)) {
      const plant = ctx.state.plants[name];
      for (let i = 0; i < count; i++) {
        const daysAgo = lastAgo + (count - 1 - i) * every;
        const fertilized = fertilizeEvery > 0 && i % fertilizeEvery === 0;
        await ctx.call("POST", `/watering/${plant.id}`, {
          token: ctx.token(plant.owner),
          json: {
            date: now - daysAgo * DAY_MS,
            usedFertilizer: fertilized,
            fertilizerTypeId: fertilized ? (i % 2) + 1 : null,
          },
        });
      }
    }
  },
};
