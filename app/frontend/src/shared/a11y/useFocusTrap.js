import { useEffect, useRef } from 'react';
import { getFocusableElements } from './focusable';

export function useFocusTrap({ active, containerRef, onEscape, initialFocusRef }) {
  const previousFocusRef = useRef(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (!active) return undefined;

    const opened = !wasActiveRef.current;
    wasActiveRef.current = true;
    if (opened) previousFocusRef.current = document.activeElement;
    const container = containerRef?.current;
    if (!container) return undefined;

    if (opened) {
      const initialTarget = initialFocusRef?.current;
      const focusables = getFocusableElements(container);
      const first = initialTarget || focusables[0] || container;
      if (first && typeof first.focus === 'function') {
        first.focus();
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onEscape?.(event);
        return;
      }

      if (event.key !== 'Tab') return;
      const nodes = getFocusableElements(container);
      if (nodes.length === 0) {
        event.preventDefault();
        container.focus?.();
        return;
      }
      const start = nodes[0];
      const end = nodes[nodes.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && current === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && current === end) {
        event.preventDefault();
        start.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (!active) {
        wasActiveRef.current = false;
        const prev = previousFocusRef.current;
        if (prev && typeof prev.focus === 'function') {
          prev.focus();
        }
      }
    };
  }, [active, containerRef, onEscape, initialFocusRef]);

  useEffect(() => {
    if (active) return undefined;
    if (wasActiveRef.current) {
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    }
    wasActiveRef.current = false;
    return undefined;
  }, [active]);
}
