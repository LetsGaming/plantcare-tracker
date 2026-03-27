/**
 * tests/mapping.test.ts
 *
 * Unit tests for all V2 API mapper classes.
 *
 * Mappers are pure functions — they receive raw V2 API shapes and return
 * typed frontend models. These tests verify the full transformation for
 * every mapper including null-safety, optional fields, and derived values.
 *
 * Run with: pnpm test
 */

import { describe, it, expect } from "vitest";
import ComponentMapper from "@/mapping/ComponentMapping";
import SubstrateMapper from "@/mapping/SubstrateMapping";
import PlantMapper from "@/mapping/PlantMapping";
import WateringMapper from "@/mapping/WateringMapping";
import SaleMapper from "@/mapping/SaleMapping";
import ImageMapper from "@/mapping/ImageMapping";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeAPIComponent = (overrides: Partial<APIComponent> = {}): APIComponent => ({
  component_id: 1,
  component_name: "Perlite",
  fineness_id: 2,
  component_fineness: "Fine",
  image_url: "https://cdn.example.com/perlite.webp",
  images: [],
  ...overrides,
});

const makeAPISubstrateComponent = (
  overrides: Partial<APISubstrateComponent> = {},
): APISubstrateComponent => ({
  component_id: 1,
  component_name: "Perlite",
  component_fineness: "Fine",
  component_parts: 3,
  ...overrides,
});

const makeAPIImage = (): APIImage => ({
  id: 10,
  url: "https://cdn.example.com/img.webp",
  date: 1748779200, // 2025-06-01T10:00:00 UTC as Unix epoch seconds
});

const makeAPISubstrate = (overrides: Partial<APISubstrate> = {}): APISubstrate => ({
  substrate_id: 5,
  substrate_user_id: 99,
  substrate_name: "Aroid Mix",
  is_public: true,
  substrate_created_at: 1736928000, // 2025-01-15T08:00:00 UTC as Unix epoch seconds
  image_url: null,
  images: [],
  components: [makeAPISubstrateComponent()],
  ...overrides,
});

const makeAPIPlant = (overrides: Partial<APIPlant> = {}): APIPlant => ({
  plant_id: 7,
  plant_user_id: 42,
  plant_name: "Monstera Deliciosa",
  plant_species: "Monstera deliciosa",
  is_public: false,
  plant_created_at: 1726839000, // 2024-09-20T14:30:00 UTC as Unix epoch seconds
  image_url: "https://cdn.example.com/plant.webp",
  substrate: { substrate_id: 5, substrate_name: "Aroid Mix" },
  images: [makeAPIImage()],
  ...overrides,
});

const makeAPIWateringRecord = (
  overrides: Partial<APIWateringRecord> = {},
): APIWateringRecord => ({
  record_id: 11,
  plant_id: 7,
  plant_name: "Monstera Deliciosa",
  owner_id: 42,
  watering_date: 1740819600, // 2025-03-01T09:00:00 UTC as Unix epoch seconds
  used_fertilizer: true,
  fertilizer_type_id: 1,
  fertilizer_type: "Organic",
  ...overrides,
});

const makeAPISale = (overrides: Partial<APISale> = {}): APISale => ({
  sale_id: "abc-123",
  sale_name: "Monstera Deliciosa 20cm",
  sale_seller: "PlantShop",
  sale_new_price: 14.99,
  sale_old_price: 19.99,
  sale_link: "https://plantshop.de/monstera",
  sale_image_url: "https://cdn.example.com/sale.webp",
  sale_scraped_at: "2025-03-05T06:00:00.000Z",
  ...overrides,
});

// ── ComponentMapper ───────────────────────────────────────────────────────────

describe("ComponentMapper.mapComponent", () => {
  it("maps all fields correctly", () => {
    const result = ComponentMapper.mapComponent(makeAPIComponent());
    expect(result.id).toBe(1);
    expect(result.name).toBe("Perlite");
    expect(result.fineness).toBe("Fine");
    expect(result.imageUrl).toBe("https://cdn.example.com/perlite.webp");
  });

  it("converts null image_url to undefined", () => {
    const result = ComponentMapper.mapComponent(makeAPIComponent({ image_url: null }));
    expect(result.imageUrl).toBeUndefined();
  });

  it("convertToComponents handles an array", () => {
    const results = ComponentMapper.convertToComponents([
      makeAPIComponent({ component_id: 1 }),
      makeAPIComponent({ component_id: 2, component_name: "Bark" }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[1].name).toBe("Bark");
  });

  it("convertToComponents wraps a single object in an array", () => {
    const results = ComponentMapper.convertToComponents(makeAPIComponent());
    expect(results).toHaveLength(1);
  });
});

describe("ComponentMapper.mapSubstrateComponent", () => {
  it("uses component_fineness as description (V2 — no component_description)", () => {
    const result = ComponentMapper.mapSubstrateComponent(makeAPISubstrateComponent());
    expect(result.description).toBe("Fine");
  });

  it("maps parts correctly", () => {
    const result = ComponentMapper.mapSubstrateComponent(
      makeAPISubstrateComponent({ component_parts: 5 }),
    );
    expect(result.parts).toBe(5);
  });
});

// ── SubstrateMapper ───────────────────────────────────────────────────────────

describe("SubstrateMapper.mapSubstrate", () => {
  it("maps scalar fields", () => {
    const result = SubstrateMapper.mapSubstrate(makeAPISubstrate());
    expect(result.id).toBe(5);
    expect(result.userId).toBe(99);
    expect(result.name).toBe("Aroid Mix");
    expect(result.isPublic).toBe(true);
  });

  it("converts null image_url to undefined", () => {
    const result = SubstrateMapper.mapSubstrate(makeAPISubstrate({ image_url: null }));
    expect(result.imageUrl).toBeUndefined();
  });

  it("maps images array", () => {
    const result = SubstrateMapper.mapSubstrate(
      makeAPISubstrate({ images: [makeAPIImage()] }),
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0].id).toBe(10);
  });

  it("maps components array", () => {
    const result = SubstrateMapper.mapSubstrate(makeAPISubstrate());
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe("Perlite");
  });

  it("handles empty images and components arrays", () => {
    const result = SubstrateMapper.mapSubstrate(
      makeAPISubstrate({ images: [], components: [] }),
    );
    expect(result.images).toHaveLength(0);
    expect(result.components).toHaveLength(0);
  });

  it("produced created_at is a non-empty string", () => {
    const result = SubstrateMapper.mapSubstrate(makeAPISubstrate());
    expect(typeof result.created_at).toBe("string");
    expect(result.created_at.length).toBeGreaterThan(0);
  });
});

// ── PlantMapper ───────────────────────────────────────────────────────────────

describe("PlantMapper.mapPlant", () => {
  it("maps scalar fields", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant());
    expect(result.id).toBe(7);
    expect(result.userId).toBe(42);
    expect(result.name).toBe("Monstera Deliciosa");
    expect(result.species).toBe("Monstera deliciosa");
    expect(result.isPublic).toBe(false);
  });

  it("uses species as description (V2 has no plant_description)", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant());
    expect(result.description).toBe("Monstera deliciosa");
  });

  it("maps substrate as a lightweight PlantSubstrateRef", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant());
    expect(result.substrate).not.toBeNull();
    expect(result.substrate!.id).toBe(5);
    expect(result.substrate!.name).toBe("Aroid Mix");
  });

  it("maps null substrate to null (not a fallback object)", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant({ substrate: null }));
    expect(result.substrate).toBeNull();
  });

  it("converts null image_url to undefined", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant({ image_url: null }));
    expect(result.imageUrl).toBeUndefined();
  });

  it("maps images array", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant());
    expect(result.images).toHaveLength(1);
  });

  it("created_at is a non-empty string", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant());
    expect(typeof result.created_at).toBe("string");
    expect(result.created_at.length).toBeGreaterThan(0);
  });

  it("convertToPlants handles array input", () => {
    const results = PlantMapper.convertToPlants([
      makeAPIPlant({ plant_id: 1 }),
      makeAPIPlant({ plant_id: 2 }),
    ]);
    expect(results).toHaveLength(2);
  });
});

// ── WateringMapper ────────────────────────────────────────────────────────────

describe("WateringMapper.mapWateringRecord", () => {
  it("maps scalar fields", () => {
    const result = WateringMapper.mapWateringRecord(makeAPIWateringRecord());
    expect(result.id).toBe(11);
    expect(result.plantId).toBe(7);
    expect(result.plantName).toBe("Monstera Deliciosa");
    expect(result.usedFertilizer).toBe(true);
    expect(result.fertilizerTypeId).toBe(1);
    expect(result.fertilizerType).toBe("Organic");
  });

  it("maps date_millis as a positive number", () => {
    const result = WateringMapper.mapWateringRecord(makeAPIWateringRecord());
    expect(result.date_millis).toBeGreaterThan(0);
  });

  it("converts null fertilizer_type_id to undefined", () => {
    const result = WateringMapper.mapWateringRecord(
      makeAPIWateringRecord({ fertilizer_type_id: null }),
    );
    expect(result.fertilizerTypeId).toBeUndefined();
  });

  it("converts null fertilizer_type to undefined", () => {
    const result = WateringMapper.mapWateringRecord(
      makeAPIWateringRecord({ fertilizer_type: null }),
    );
    expect(result.fertilizerType).toBeUndefined();
  });

  it("mapFertilizerType maps correctly", () => {
    const result = WateringMapper.mapFertilizerType({
      fertilizer_id: 3,
      fertilizer_name: "Organic",
    });
    expect(result.id).toBe(3);
    expect(result.name).toBe("Organic");
  });
});

// ── SaleMapper ────────────────────────────────────────────────────────────────

describe("SaleMapper.mapSale", () => {
  it("maps scalar fields", () => {
    const result = SaleMapper.mapSale(makeAPISale());
    expect(result.id).toBe("abc-123");
    expect(result.seller).toBe("PlantShop");
    expect(result.price).toBe(14.99);
    expect(result.oldPrice).toBe(19.99);
    expect(result.link).toBe("https://plantshop.de/monstera");
    expect(result.scrapedAt).toBe("2025-03-05T06:00:00.000Z");
  });

  it("name is truncated to 45 chars for long names", () => {
    const longName = "A".repeat(60);
    const result = SaleMapper.mapSale(makeAPISale({ sale_name: longName }));
    expect(result.name.length).toBeLessThanOrEqual(45);
    expect(result.nameFull).toBe(longName);
  });

  it("name is not truncated when 45 chars or fewer", () => {
    const shortName = "Monstera Deliciosa 20cm";
    const result = SaleMapper.mapSale(makeAPISale({ sale_name: shortName }));
    expect(result.name).toBe(shortName);
  });

  it("converts null image_url to undefined", () => {
    const result = SaleMapper.mapSale(makeAPISale({ sale_image_url: null }));
    expect(result.imageUrl).toBeUndefined();
  });

  it("handles missing optional sale_image_url and sale_scraped_at", () => {
    const sale: APISale = {
      sale_id: "x",
      sale_name: "Test",
      sale_seller: "Shop",
      sale_new_price: 5,
      sale_old_price: 10,
      sale_link: "https://example.com",
    };
    const result = SaleMapper.mapSale(sale);
    expect(result.imageUrl).toBeUndefined();
    expect(result.scrapedAt).toBeUndefined();
  });

  it("convertToSales handles array input", () => {
    const results = SaleMapper.convertToSales([
      makeAPISale({ sale_id: "a" }),
      makeAPISale({ sale_id: "b" }),
    ]);
    expect(results).toHaveLength(2);
  });
});

// ── ImageMapper ───────────────────────────────────────────────────────────────

describe("ImageMapper.mapImage", () => {
  it("maps all image fields", () => {
    const result = ImageMapper.mapImage(makeAPIImage());
    expect(result.id).toBe(10);
    expect(result.url).toBe("https://cdn.example.com/img.webp");
    expect(typeof result.date).toBe("string");
    expect(result.date_millis).toBeGreaterThan(0);
  });

  it("convertToImages handles empty array", () => {
    expect(ImageMapper.convertToImages([])).toHaveLength(0);
  });
});
