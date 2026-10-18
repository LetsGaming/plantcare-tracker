import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIST } from '../../../src/core/config/constants';
import { MAX_UPLOAD_BYTES } from '../../../src/modules/images/presentation/uploadErrors';

const frontendSrc = join(__dirname, '..', '..', '..', '..', 'frontend', 'src');

const readNumber = (relativePath: string, name: string): number => {
  const source = readFileSync(join(frontendSrc, ...relativePath.split('/')), 'utf8');
  const match = new RegExp(`const ${name}\\s*=\\s*([0-9_*\\s]+);`).exec(source);
  if (!match) throw new Error(`${name} not found in frontend/src/${relativePath}`);
  return match[1]
    .replace(/_/g, '')
    .split('*')
    .reduce((product, factor) => product * Number(factor.trim()), 1);
};

describe('frontend constants mirror the backend limits', () => {
  it('upload size', () => {
    expect(readNumber('utils/imageValidation.ts', 'MAX_IMAGE_BYTES')).toBe(MAX_UPLOAD_BYTES);
  });

  it('default page size', () => {
    expect(readNumber('stores/paged.ts', 'PAGE_SIZE')).toBe(LIST.DEFAULT_LIMIT);
  });

  it('load-all page size is the largest page the backend serves', () => {
    expect(readNumber('stores/paged.ts', 'LOAD_ALL_PAGE_SIZE')).toBe(LIST.MAX_LIMIT);
  });

  it('used-in page size fits the backend page cap', () => {
    expect(readNumber('stores/substrates.ts', 'USED_IN_PAGE_SIZE')).toBeLessThanOrEqual(
      LIST.MAX_LIMIT,
    );
  });

  it('search term length', () => {
    expect(readNumber('components/SearchBar.vue', 'SEARCH_MAX_LENGTH')).toBe(
      LIST.MAX_QUERY_LENGTH,
    );
  });
});
