import { useEffect, useRef, type RefObject } from 'react';

/** Fires `onLoadMore` when `sentinelRef` enters the scroll root (or viewport). */
export function useInfiniteScroll(
  enabled: boolean,
  onLoadMore: () => void,
  options?: { rootMargin?: string; rootRef?: RefObject<Element | null>; root?: Element | null },
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!enabled || !node) return;
    const root = options?.root ?? options?.rootRef?.current ?? null;
    // Nested scroll boxes need an explicit root; skip until that node exists.
    if (options?.rootRef && !root && options.root == null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        Promise.resolve(onLoadMore()).finally(() => {
          loadingRef.current = false;
        });
      },
      { root, rootMargin: options?.rootMargin ?? '240px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onLoadMore, options?.root, options?.rootMargin, options?.rootRef]);

  return sentinelRef;
}
