import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Smart auto-scroll hook.
 * - Auto-scrolls to bottom when new messages arrive IF user is near the bottom.
 * - Shows "New messages ↓" button if user scrolled up.
 *
 * IMPORTANT: deps should use PRIMITIVE values (e.g. messages.length, isLoading)
 * to avoid infinite re-fire from array reference changes.
 */
export function useAutoScroll(deps: any[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const userScrolledRef = useRef(false); // Track if user manually scrolled up

  const THRESHOLD = 150; // px from bottom to consider "at bottom"

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Auto-scroll when deps change (messages.length, isLoading)
  useEffect(() => {
    // Don't auto-scroll if user manually scrolled up
    if (userScrolledRef.current) return;

    // Use requestAnimationFrame to batch with rendering
    requestAnimationFrame(() => {
      if (isNearBottom()) {
        scrollToBottom(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Track scroll position — detect manual scrolling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const nearBottom = isNearBottom();
      userScrolledRef.current = !nearBottom;
      setShowScrollButton(!nearBottom);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isNearBottom]);

  return {
    containerRef,
    endRef,
    showScrollButton,
    scrollToBottom: () => {
      userScrolledRef.current = false;
      scrollToBottom(true);
      setShowScrollButton(false);
    },
  };
}
