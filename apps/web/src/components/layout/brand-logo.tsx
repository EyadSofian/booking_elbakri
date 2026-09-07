import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The ELBAKRI OVERSEAS mark.
 *
 * This renders the original supplied artwork exactly as delivered — it is never
 * redrawn, recoloured, vectorised or retyped as text. Aspect ratio is preserved
 * with object-fit: contain, and where the mark needs to sit on a dark ground the
 * surface behind it changes, not the logo.
 */
export function BrandLogo({
  variant = 'default',
  className,
  priority = false,
}: {
  /** `light` is the supplied white-on-transparent artwork, for dark surfaces. */
  variant?: 'default' | 'light';
  className?: string;
  priority?: boolean;
}) {
  const src = variant === 'light' ? '/brand/elbakri-logo-white.png' : '/brand/elbakri-logo.png';
  return (
    <Image
      src={src}
      alt="ELBAKRI OVERSEAS"
      width={2172}
      height={724}
      priority={priority}
      className={cn('h-auto w-auto object-contain', className)}
      sizes="(max-width: 640px) 180px, 240px"
    />
  );
}

/**
 * The compact mark for the collapsed sidebar.
 *
 * The full artwork is used and cropped by the viewport of its container, so the
 * icon on screen is still the original file rather than a redrawn glyph.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('relative block h-8 w-8 shrink-0 overflow-hidden', className)}
      aria-label="ELBAKRI OVERSEAS"
    >
      <Image
        src="/brand/elbakri-logo-white.png"
        alt=""
        width={2172}
        height={724}
        aria-hidden
        className="absolute start-0 top-1/2 h-8 w-auto max-w-none -translate-y-1/2 object-contain object-left"
      />
    </span>
  );
}
