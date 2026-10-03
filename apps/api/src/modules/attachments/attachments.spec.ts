import { sniffMimeType } from './attachments.module';

describe('sniffMimeType — the file is what its bytes say, not what its name says', () => {
  const bytes = (...b: number[]) => Buffer.concat([Buffer.from(b), Buffer.alloc(16)]);

  it('recognises photos, scans and PDFs', () => {
    expect(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffMimeType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))).toBe('image/webp');
    expect(sniffMimeType(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(sniffMimeType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffMimeType(Buffer.from('MZ\x90\x00 an executable'))).toBeNull();
    expect(sniffMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
  });
});
