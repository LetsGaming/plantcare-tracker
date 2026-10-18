import { describe, it, expect } from 'vitest';
import { toImageDto } from '../../../src/modules/images/domain/imageDto';
import { imageRowToDto, IMAGE_COLUMNS } from '../../../src/modules/images/infrastructure/imageRows';
import { variantUrl } from '../../../src/core/config/uploads';

describe('imageRowToDto', () => {
  it('maps a stored row to a DTO with an absolute url', () => {
    const dto = imageRowToDto({
      id: 2,
      image_url: 'https://h.test/uploads/plant/b.webp',
      upload_date: 5,
      variants: 0,
      width: null,
      height: null,
      placeholder: null,
    });
    expect(dto).toMatchObject({ id: 2, url: 'https://h.test/uploads/plant/b.webp', date: 5 });
  });

  it('selects every column the mapper reads', () => {
    expect([...IMAGE_COLUMNS].sort()).toEqual(
      ['height', 'id', 'image_url', 'placeholder', 'upload_date', 'variants', 'width'].sort(),
    );
  });
});

const row = {
  id: 4,
  url: 'https://api.example.com/uploads/plant/a.webp',
  date: 1700000000,
  variants: 1,
  width: 1024,
  height: 768,
  placeholder: '#336644',
};

describe('variantUrl', () => {
  it('inserts the width before the extension for absolute and relative urls', () => {
    expect(variantUrl('/uploads/plant/a.webp', 160)).toBe('/uploads/plant/a-160.webp');
    expect(variantUrl('https://h.test/uploads/plant/a.webp', 480)).toBe(
      'https://h.test/uploads/plant/a-480.webp',
    );
  });
});

describe('toImageDto', () => {
  it('builds a srcset with all three widths when variants exist', () => {
    expect(toImageDto(row)).toEqual({
      id: 4,
      url: row.url,
      srcset:
        'https://api.example.com/uploads/plant/a-160.webp 160w, https://api.example.com/uploads/plant/a-480.webp 480w, https://api.example.com/uploads/plant/a.webp 1024w',
      width: 1024,
      height: 768,
      placeholder: '#336644',
      date: 1700000000,
    });
  });

  it('omits srcset for images without variants', () => {
    expect(toImageDto({ ...row, variants: 0 }).srcset).toBeNull();
  });

  it('omits srcset for non-webp urls and urls with a query string even when variants exist', () => {
    expect(toImageDto({ ...row, url: '/uploads/plant/a.png' }).srcset).toBeNull();
    expect(toImageDto({ ...row, url: '/uploads/plant/a.webp?v=1' }).srcset).toBeNull();
  });

  it('passes null dimensions and placeholder through', () => {
    const dto = toImageDto({ ...row, variants: 0, width: null, height: null, placeholder: null });
    expect([dto.width, dto.height, dto.placeholder]).toEqual([null, null, null]);
  });
});
