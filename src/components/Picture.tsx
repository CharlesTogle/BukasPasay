import { useEffect, useRef } from 'react';
import type { Photo } from '../lib/photos';

/**
 * A photograph in its frame. `develop` is the page's one moment: the
 * photograph comes up once like a print in the developer tray (grey and
 * soft, then its darks, then its colour) as it first comes on screen.
 * Without script, or under reduced motion, it simply shows.
 */
export default function Picture({
  photo,
  sizes,
  eager,
  develop,
  className,
}: {
  photo: Photo;
  sizes: string;
  eager?: boolean;
  develop?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!develop || !el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    el.classList.add('develop-ready');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('developed');
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [develop]);
  return (
    <div ref={ref} className={`frame${develop ? ' develop' : ''}${className ? ' ' + className : ''}`}>
      <img
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
      />
    </div>
  );
}
