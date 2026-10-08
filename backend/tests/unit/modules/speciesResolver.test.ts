import { describe, it, expect } from 'vitest';
import {
  SpeciesResolver,
  fuzzyThreshold,
  levenshtein,
  normaliseSpecies,
  type SpeciesCatalog,
  type SpeciesEntry,
} from '../../../src/modules/plants/domain/SpeciesResolver';

const makeCatalog = (names: string[]) => {
  const entries: SpeciesEntry[] = names.map((name, i) => ({ id: i + 1, name }));
  let reads = 0;
  const catalog: SpeciesCatalog = {
    all: async () => {
      reads += 1;
      return [...entries];
    },
    add: async (name) => {
      const id = entries.length + 1;
      entries.push({ id, name });
      return id;
    },
  };
  return { catalog, entries, reads: () => reads };
};

describe('helpers', () => {
  it('normalises case, dots and whitespace', () => {
    expect(normaliseSpecies('  Ficus   sp.  Lyrata ')).toBe('ficus sp lyrata');
  });

  it('computes the edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('scales the threshold with the name length', () => {
    expect([4, 8, 14, 20].map((n) => fuzzyThreshold('x'.repeat(n)))).toEqual([0, 1, 2, 3]);
  });
});

describe('SpeciesResolver', () => {
  it('returns null for blank names', async () => {
    const { catalog } = makeCatalog([]);
    const resolver = new SpeciesResolver(catalog);
    expect(await resolver.resolve(undefined)).toBeNull();
    expect(await resolver.resolve('   ')).toBeNull();
  });

  it('reuses an exact match ignoring case', async () => {
    const { catalog, entries } = makeCatalog(['Monstera deliciosa']);
    expect(await new SpeciesResolver(catalog).resolve('monstera DELICIOSA')).toBe(1);
    expect(entries).toHaveLength(1);
  });

  it('reuses the closest entry within the threshold', async () => {
    const { catalog, entries } = makeCatalog(['Monstera deliciosa', 'Monstera adansonii']);
    expect(await new SpeciesResolver(catalog).resolve('Monstera delicosa')).toBe(1);
    expect(entries).toHaveLength(2);
  });

  it('requires exact matches for short names', async () => {
    const { catalog, entries } = makeCatalog(['Aloe']);
    expect(await new SpeciesResolver(catalog).resolve('Alo')).toBe(2);
    expect(entries.map((e) => e.name)).toEqual(['Aloe', 'Alo']);
  });

  it('inserts a trimmed new species and sees it on the next call', async () => {
    const { catalog, entries, reads } = makeCatalog(['Pilea peperomioides']);
    const resolver = new SpeciesResolver(catalog);
    const id = await resolver.resolve('  Hoya carnosa ');
    expect(entries.at(-1)).toEqual({ id, name: 'Hoya carnosa' });
    expect(await resolver.resolve('hoya carnosa')).toBe(id);
    expect(reads()).toBe(2);
  });

  it('reads the catalogue once while nothing is inserted', async () => {
    const { catalog, reads } = makeCatalog(['Pilea peperomioides']);
    const resolver = new SpeciesResolver(catalog);
    await resolver.resolve('Pilea peperomioides');
    await resolver.resolve('pilea peperomioides');
    expect(reads()).toBe(1);
  });
});
