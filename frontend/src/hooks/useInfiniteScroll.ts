import { useEffect, useRef } from 'react';

/** Fires `onLoadMore` when `sentinelRef` enters the scroll viewport. */
export function useInfiniteScroll(
  enabled: boolean,
  onLoadMore: () => void,
  options?: { rootMargin?: string },
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!enabled || !node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        Promise.resolve(onLoadMore()).finally(() => {
          loadingRef.current = false;
        });
      },
      { root: null, rootMargin: options?.rootMargin ?? '240px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onLoadMore, options?.rootMargin]);

  return sentinelRef;
}
