import { cleanDisplay, isEmptyMarker, normalizeForSearch, similarity, tokenSimilarity } from './text';

describe('normalizeForSearch', () => {
  it('is case and whitespace insensitive', () => {
    expect(normalizeForSearch('  JOSEPH   FAKHRY ')).toBe('joseph fakhry');
  });
  it('folds Arabic letter variants', () => {
    expect(normalizeForSearch('البكرى')).toBe(normalizeForSearch('البكري'));
    expect(normalizeForSearch('أحمد')).toBe(normalizeForSearch('احمد'));
  });
  it('preserves the Arabic letters themselves — folding must not erase them', () => {
    // Guards against a diacritic character class whose range accidentally
    // spans the Arabic letter block and deletes the whole word.
    expect(normalizeForSearch('البكري اوفرسيز')).toBe('البكري اوفرسيز');
    expect(normalizeForSearch('عبد الحميد حامد')).toBe('عبد الحميد حامد');
    expect(normalizeForSearch('سـوفت اول انكلوسيف').length).toBeGreaterThan(10);
  });
  it('removes tatweel without touching the letters around it', () => {
    expect(normalizeForSearch('سـوفت')).toBe('سوفت');
  });
  it('keeps Arabic and Latin names distinct', () => {
    expect(normalizeForSearch('سما')).not.toBe(normalizeForSearch('sama'));
  });
  it('converts Arabic-Indic digits', () => {
    expect(normalizeForSearch('٢٠٢٥')).toBe('2025');
  });
  it('is idempotent', () => {
    const once = normalizeForSearch('SAMA-TOURS');
    expect(normalizeForSearch(once)).toBe(once);
  });
  it('never mutates the display value', () => {
    const original = 'Semaan Antoun';
    normalizeForSearch(original);
    expect(original).toBe('Semaan Antoun');
  });
  it('handles null and undefined', () => {
    expect(normalizeForSearch(null)).toBe('');
    expect(normalizeForSearch(undefined)).toBe('');
  });
});

describe('isEmptyMarker', () => {
  it('recognises the markers typed in the legacy sheets', () => {
    ['-', '--', '---------', '_____________', '.', '...', 'N/A'].forEach((v) => {
      expect(isEmptyMarker(v)).toBe(true);
    });
  });
  it('does not treat real data as a marker', () => {
    expect(isEmptyMarker('done')).toBe(false);
    expect(isEmptyMarker('0')).toBe(false);
    expect(isEmptyMarker('NO')).toBe(false);
  });
});

describe('cleanDisplay', () => {
  it('collapses whitespace and returns null for blanks', () => {
    expect(cleanDisplay('  a   b  ')).toBe('a b');
    expect(cleanDisplay('   ')).toBeNull();
    expect(cleanDisplay(null)).toBeNull();
  });
});

describe('similarity helpers', () => {
  it('scores near-identical strings highly', () => {
    expect(similarity('YELLOW', 'YELOW')).toBeGreaterThan(0.8);
  });
  it('is order-insensitive for token similarity', () => {
    expect(tokenSimilarity('sama tours', 'tours sama')).toBe(1);
  });
  it('scores unrelated strings low', () => {
    expect(similarity('SAMA', 'TAZKARA')).toBeLessThan(0.4);
  });
});
