import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import './ChartMobileFrame.css';

const ZOOM_STEPS = [0.85, 1, 1.2, 1.45] as const;

interface Props {
  children: ReactNode;
  chartKey: string;
  height?: number;
  needsHorizontalScroll?: boolean;
  innerWidth?: number;
  scrollRef?: RefObject<HTMLDivElement | null>;
  showScrollLadder?: boolean;
}

export default function ChartMobileFrame({
  children,
  chartKey,
  height = 220,
  needsHorizontalScroll = false,
  innerWidth,
  scrollRef,
  showScrollLadder = false,
}: Props) {
  const internalRef = useRef<HTMLDivElement>(null);
  const viewportRef = scrollRef ?? internalRef;
  const [zoomIndex, setZoomIndex] = useState(1);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const zoom = ZOOM_STEPS[zoomIndex];
  const scaledHeight = Math.round(height * zoom);
  const scaledInnerWidth = innerWidth ? Math.round(innerWidth * zoom) : undefined;

  const updateScrollState = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !needsHorizontalScroll) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxLeft - 4);
  }, [needsHorizontalScroll, viewportRef]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollState) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro?.disconnect();
    };
  }, [updateScrollState, viewportRef, chartKey, needsHorizontalScroll, scaledInnerWidth]);

  const scrollBy = (delta: number) => {
    viewportRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const showLadder = showScrollLadder && needsHorizontalScroll;

  return (
    <div className="chart-mobile-frame" data-chart={chartKey}>
      <div className="chart-mobile-toolbar">
        <span className="chart-mobile-hint">
          {needsHorizontalScroll ? 'Swipe ↔ or tap arrows to see more' : 'Pinch or use zoom buttons'}
        </span>
        <div className="chart-zoom-controls" role="group" aria-label="Chart zoom">
          <button
            type="button"
            className="chart-zoom-btn"
            onClick={() => setZoomIndex(i => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="chart-zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="chart-zoom-btn"
            onClick={() => setZoomIndex(i => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {showLadder && (
        <div className="chart-scroll-ladder" role="group" aria-label="Chart horizontal navigation">
          <button
            type="button"
            className="chart-scroll-btn"
            onClick={() => scrollBy(-Math.max(140, (viewportRef.current?.clientWidth ?? 200) * 0.65))}
            disabled={!canScrollLeft}
            aria-label="Scroll chart left"
          >
            ←
          </button>
          <div className="chart-scroll-track" aria-hidden="true">
            <span className={`chart-scroll-thumb${canScrollLeft ? ' chart-scroll-thumb--active' : ''}`} />
            <span className={`chart-scroll-thumb${canScrollRight ? ' chart-scroll-thumb--active' : ''}`} />
          </div>
          <button
            type="button"
            className="chart-scroll-btn"
            onClick={() => scrollBy(Math.max(140, (viewportRef.current?.clientWidth ?? 200) * 0.65))}
            disabled={!canScrollRight}
            aria-label="Scroll chart right"
          >
            →
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={`chart-mobile-viewport${needsHorizontalScroll ? ' chart-mobile-viewport--scroll' : ''}`}
        style={{ height: scaledHeight }}
      >
        <div
          className="chart-mobile-inner"
          style={{
            width: needsHorizontalScroll && scaledInnerWidth ? scaledInnerWidth : '100%',
            minWidth: needsHorizontalScroll ? '100%' : undefined,
            height: scaledHeight,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
