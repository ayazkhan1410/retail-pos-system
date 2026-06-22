import { useEffect, useRef, useCallback } from 'react';

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options?: { ctrl?: boolean; shift?: boolean; alt?: boolean },
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { ctrl = false, shift = false, alt = false } = options ?? {};
      if (
        e.key.toLowerCase() === key.toLowerCase() &&
        e.ctrlKey === ctrl &&
        e.shiftKey === shift &&
        e.altKey === alt
      ) {
        e.preventDefault();
        callbackRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, options?.ctrl, options?.shift, options?.alt]);
}

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          onScan(bufferRef.current);
          bufferRef.current = '';
        }
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          bufferRef.current = '';
        }, 100);
      }
    },
    [onScan],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
