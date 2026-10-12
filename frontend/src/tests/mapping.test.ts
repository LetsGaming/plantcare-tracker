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
import ImageMapper, { toImageView, toImageViews } from "@/mapping/ImageMapping";
import {
  apiComponentListItem,
  apiImageDto,
  apiPlantDetail,
  apiPlantListItem,
  apiSale,
  apiSubstrateDetail,
  apiSubstrateListItem,
  apiWateringItem,
  apiWateringSummary,
} from "./helpers";

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

const makeAPIWateringRecord = (overrides: Partial<APIWateringRecord> = {}): APIWateringRecord => ({
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

const makeAPISale = apiSale;

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
    const result = SubstrateMapper.mapSubstrate(makeAPISubstrate({ images: [makeAPIImage()] }));
    expect(result.images).toHaveLength(1);
    expect(result.images[0].id).toBe(10);
  });

  it("maps components array", () => {
    const result = SubstrateMapper.mapSubstrate(makeAPISubstrate());
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe("Perlite");
  });

  it("handles empty images and components arrays", () => {
    const result = SubstrateMapper.mapSubstrate(makeAPISubstrate({ images: [], components: [] }));
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

  it("keeps a missing species null and the description empty", () => {
    const result = PlantMapper.mapPlant(makeAPIPlant({ plant_species: null }));
    expect(result.species).toBeNull();
    expect(result.description).toBe("");
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
    expect(result.discountPct).toBe(25);
    expect(result.firstSeenAt).toBe(1741150800000);
    expect(result.scrapedAt).toBe(1741154400000);
  });

  it("freezes the sale", () => {
    expect(Object.isFrozen(SaleMapper.mapSale(makeAPISale()))).toBe(true);
  });

  it("keeps a missing old price and discount null", () => {
    const result = SaleMapper.mapSale(
      makeAPISale({ sale_old_price: null, sale_discount_pct: null }),
    );
    expect(result.oldPrice).toBeNull();
    expect(result.discountPct).toBeNull();
  });

  it("drops generated letter tiles but keeps real photos", () => {
    const tile = SaleMapper.mapSale(
      makeAPISale({ sale_image_url: "data:image/svg+xml;base64,PHN2Zz4=" }),
    );
    expect(tile.imageUrl).toBeUndefined();
    expect(SaleMapper.mapSale(makeAPISale()).imageUrl).toBe("https://cdn.example.com/sale.webp");
  });

  it("builds the lowercase search key from the full name and the seller", () => {
    const result = SaleMapper.mapSale(makeAPISale({ sale_name: "Rare ALBO", sale_seller: "Shop" }));
    expect(result.searchKey).toBe("rare albo\nshop");
  });

  it("maps a detail with its price history in ms, frozen", () => {
    const { sale, history } = SaleMapper.mapDetail({
      ...makeAPISale(),
      history: [
        { price: 19.99, observed_at: 1741000000000 },
        { price: 14.99, observed_at: 1741154400000 },
      ],
    });
    expect(sale.id).toBe("abc-123");
    expect(history).toEqual([
      { price: 19.99, observedAt: 1741000000000 },
      { price: 14.99, observedAt: 1741154400000 },
    ]);
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history[0])).toBe(true);
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

// ── Paged API shapes ──────────────────────────────────────────────────────────

describe("toImageView", () => {
  it("converts the date from epoch seconds to ms and keeps the variant metadata", () => {
    const view = toImageView(apiImageDto({ date: 1748779200 }));
    expect(view).toEqual({
      id: 10,
      url: "/uploads/plant-10.webp",
      srcset:
        "/uploads/plant-10-160.webp 160w, /uploads/plant-10-480.webp 480w, /uploads/plant-10.webp 1024w",
      width: 1024,
      height: 768,
      placeholder: "#4a7a3c",
      dateMs: 1748779200000,
    });
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("keeps a legacy image without variants null-safe", () => {
    const view = toImageView(
      apiImageDto({ srcset: null, width: null, height: null, placeholder: null }),
    );
    expect(view.srcset).toBeNull();
    expect(view.width).toBeNull();
    expect(view.placeholder).toBeNull();
  });

  it("freezes the list of images", () => {
    const views = toImageViews([apiImageDto({ id: 1 }), apiImageDto({ id: 2 })]);
    expect(views.map((image) => image.id)).toEqual([1, 2]);
    expect(Object.isFrozen(views)).toBe(true);
    expect(toImageViews(undefined)).toEqual([]);
  });
});

describe("PlantMapper list and detail", () => {
  it("maps a list item to a frozen view with ms dates and a summary", () => {
    const view = PlantMapper.mapListItem(
      apiPlantListItem({
        watering: apiWateringSummary({
          last_watered_at: 1741000000000,
          last_fertilized_at: 1740000000000,
          avg_interval_days: 3.5,
        }),
      }),
    );
    expect(view).toMatchObject({
      id: 7,
      name: "Monstera Deliciosa",
      userId: 42,
      isPublic: false,
      createdAt: 1726839000000,
      speciesName: "Monstera deliciosa",
      substrate: { id: 5, name: "Aroid Mix" },
      imageCount: 1,
      watering: {
        lastWateredAt: 1741000000000,
        lastFertilizedAt: 1740000000000,
        avgIntervalDays: 3.5,
      },
    });
    expect(view.cover?.dateMs).toBe(1748779200000);
    expect(view.images).toBeUndefined();
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.substrate)).toBe(true);
    expect(Object.isFrozen(view.watering)).toBe(true);
  });

  it("precomputes a lowercase search text from name and species", () => {
    expect(PlantMapper.mapListItem(apiPlantListItem()).searchText).toBe(
      "monstera deliciosa\nmonstera deliciosa",
    );
    expect(
      PlantMapper.mapListItem(apiPlantListItem({ plant_name: "Cutting", species_name: null }))
        .searchText,
    ).toBe("cutting");
  });

  it("keeps null substrate, cover and watering (plants of others)", () => {
    const view = PlantMapper.mapListItem(
      apiPlantListItem({ substrate: null, cover: null, watering: null }),
    );
    expect(view.substrate).toBeNull();
    expect(view.cover).toBeNull();
    expect(view.watering).toBeNull();
  });

  it("maps a detail with its images oldest first", () => {
    const view = PlantMapper.mapDetail(
      apiPlantDetail({ images: [apiImageDto({ id: 1 }), apiImageDto({ id: 2 })] }),
    );
    expect(view.images?.map((image) => image.id)).toEqual([1, 2]);
    expect(Object.isFrozen(view.images)).toBe(true);
  });

  it("withWatering returns a new frozen plant with the new summary", () => {
    const plant = PlantMapper.mapListItem(apiPlantListItem());
    const summary = WateringMapper.mapSummary(apiWateringSummary({ last_watered_at: 5 }));
    const next = PlantMapper.withWatering(plant, summary);
    expect(next).not.toBe(plant);
    expect(next.watering).toBe(summary);
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe("SubstrateMapper list and detail", () => {
  it("normalises the list shape", () => {
    const view = SubstrateMapper.toView(apiSubstrateListItem());
    expect(view).toEqual({
      id: 5,
      name: "Aroid Mix",
      userId: 99,
      isPublic: true,
      createdAt: 1736928000000,
      cover: null,
      componentCount: 2,
      components: null,
      searchText: "aroid mix",
    });
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("normalises the detail shape (legacy field names) to the same model", () => {
    const view = SubstrateMapper.toView(apiSubstrateDetail());
    expect(view).toMatchObject({
      id: 5,
      name: "Aroid Mix",
      userId: 99,
      isPublic: true,
      createdAt: 1736928000000,
      cover: null,
      componentCount: 2,
      images: [],
      searchText: "aroid mix",
    });
    expect(view.components).toEqual([
      {
        id: 1,
        name: "Perlite",
        finenessId: null,
        fineness: "Fine",
        cover: null,
        parts: 3,
        searchText: "perlite\nfine",
      },
      {
        id: 2,
        name: "Bark",
        finenessId: null,
        fineness: "Coarse",
        cover: null,
        parts: 2,
        searchText: "bark\ncoarse",
      },
    ]);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.components)).toBe(true);
    expect(Object.isFrozen(view.components![0])).toBe(true);
  });

  it("list and detail of the same substrate share every list field", () => {
    const list = SubstrateMapper.mapListItem(apiSubstrateListItem());
    const detail = SubstrateMapper.mapDetail(apiSubstrateDetail());
    for (const key of [
      "id",
      "name",
      "userId",
      "isPublic",
      "createdAt",
      "componentCount",
    ] as const) {
      expect(detail[key]).toEqual(list[key]);
    }
  });

  it("maps the cover of both shapes", () => {
    const cover = apiImageDto({ id: 3 });
    expect(SubstrateMapper.mapListItem(apiSubstrateListItem({ cover })).cover?.id).toBe(3);
    expect(SubstrateMapper.mapDetail(apiSubstrateDetail({ cover })).cover?.id).toBe(3);
  });
});

describe("ComponentMapper list and detail", () => {
  it("maps a list item to a frozen view", () => {
    const view = ComponentMapper.mapListItem(apiComponentListItem({ cover: apiImageDto() }));
    expect(view).toMatchObject({
      id: 1,
      name: "Perlite",
      finenessId: 2,
      fineness: "Fine",
      searchText: "perlite\nfine",
    });
    expect(view.cover?.dateMs).toBe(1748779200000);
    expect(view.images).toBeUndefined();
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("maps a detail with images", () => {
    const view = ComponentMapper.mapDetail({
      ...apiComponentListItem(),
      images: [apiImageDto({ id: 4 })],
    });
    expect(view.images?.map((image) => image.id)).toEqual([4]);
  });
});

describe("WateringMapper entries and summaries", () => {
  it("maps a history item to a frozen entry with an ms date", () => {
    const entry = WateringMapper.mapEntry(
      apiWateringItem({ used_fertilizer: true, fertilizer_type_id: 2 }),
    );
    expect(entry).toEqual({
      id: 11,
      plantId: 7,
      date: 1740819600000,
      usedFertilizer: true,
      fertilizerTypeId: 2,
    });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it("maps a summary and keeps nulls", () => {
    const summary = WateringMapper.mapSummary(apiWateringSummary());
    expect(summary).toEqual({ lastWateredAt: null, lastFertilizedAt: null, avgIntervalDays: null });
    expect(Object.isFrozen(summary)).toBe(true);
  });

  it("keys batch summaries by numeric plant id and skips missing plants", () => {
    const byPlant = WateringMapper.mapSummaries({
      "7": apiWateringSummary({ last_watered_at: 1 }),
      "12": apiWateringSummary({ avg_interval_days: 2 }),
    });
    expect([...byPlant.keys()]).toEqual([7, 12]);
    expect(byPlant.get(7)?.lastWateredAt).toBe(1);
    expect(byPlant.has(8)).toBe(false);
    expect(WateringMapper.mapSummaries(undefined).size).toBe(0);
  });
});
