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
import { toImageView, toImageViews } from "@/mapping/ImageMapping";
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

const makeAPISale = apiSale;

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
    const view = SubstrateMapper.mapListItem(apiSubstrateListItem());
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
    const view = SubstrateMapper.mapDetail(apiSubstrateDetail());
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
