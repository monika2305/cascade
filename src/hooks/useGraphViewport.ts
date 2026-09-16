import { useState, useRef, useCallback, useEffect } from 'react';
import type { LayoutNode } from '../utils/graphLayout';

export interface GraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  graphWidth: number;
  graphHeight: number;
  cx: number;
  cy: number;
}

export interface UseGraphViewportOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  targetMaxZoom?: number;
}

/**
 * Accurately calculates bounding box of all nodes, or an optional subset of node IDs.
 */
export function calculateGraphBounds(
  layoutNodes: Map<string, LayoutNode>,
  subsetIds?: string[] | Set<string> | null
): GraphBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const idSet = subsetIds
    ? subsetIds instanceof Set
      ? subsetIds
      : new Set(subsetIds)
    : null;

  layoutNodes.forEach((node, id) => {
    if (idSet && !idSet.has(id)) return;
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  });

  // Fallback if subset is empty or invalid
  if (!Number.isFinite(minX)) {
    // If subset didn't match, calculate for all nodes
    if (idSet && idSet.size > 0 && layoutNodes.size > 0) {
      return calculateGraphBounds(layoutNodes, null);
    }
    minX = 0;
    maxX = 400;
    minY = 0;
    maxY = 300;
  }

  const graphWidth = Math.max(maxX - minX, 100);
  const graphHeight = Math.max(maxY - minY, 100);

  return {
    minX,
    maxX,
    minY,
    maxY,
    graphWidth,
    graphHeight,
    cx: minX + graphWidth / 2,
    cy: minY + graphHeight / 2,
  };
}

/**
 * Standardized Graph Viewport Hook:
 * - Deterministically centers and scales graph to fit container viewport width AND height
 * - Guarantees no important nodes start outside the visible screen
 * - Responds to window / container size changes via ResizeObserver
 * - Smooth pan, drag, and zoom controls
 */
export function useGraphViewport(
  containerRef: React.RefObject<HTMLDivElement | null>,
  layoutNodes: Map<string, LayoutNode>,
  options: UseGraphViewportOptions = {}
) {
  const {
    padding = 75,
    minZoom = 0.25,
    maxZoom = 2.2,
    targetMaxZoom = 1.05,
  } = options;

  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasUserInteractedRef = useRef<boolean>(false);
  const activeSubsetRef = useRef<string[] | Set<string> | null>(null);

  // Fit graph to bounds
  const fitGraph = useCallback(
    (subsetIds?: string[] | Set<string> | null) => {
      if (subsetIds !== undefined) {
        activeSubsetRef.current = subsetIds;
      }
      const targetSubset = subsetIds !== undefined ? subsetIds : activeSubsetRef.current;

      if (!containerRef.current || layoutNodes.size === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const bounds = calculateGraphBounds(layoutNodes, targetSubset);
      const availWidth = Math.max(rect.width - padding * 2, 80);
      const availHeight = Math.max(rect.height - padding * 2, 80);

      const scaleX = availWidth / bounds.graphWidth;
      const scaleY = availHeight / bounds.graphHeight;
      const fitScale = Math.min(scaleX, scaleY);
      const optimalZoom = Math.max(minZoom, Math.min(targetMaxZoom, fitScale));

      const newPanX = rect.width / 2 - bounds.cx * optimalZoom;
      const newPanY = rect.height / 2 - bounds.cy * optimalZoom;

      setZoom(optimalZoom);
      setPan({ x: newPanX, y: newPanY });
    },
    [containerRef, layoutNodes, padding, minZoom, targetMaxZoom]
  );

  // Initial fit when layoutNodes or container changes
  useEffect(() => {
    let animationFrameId: number;

    const performInitialFit = () => {
      if (containerRef.current && layoutNodes.size > 0) {
        fitGraph(activeSubsetRef.current);
      }
    };

    animationFrameId = requestAnimationFrame(performInitialFit);
    return () => cancelAnimationFrame(animationFrameId);
  }, [layoutNodes, fitGraph]);

  // ResizeObserver to automatically adjust on window/container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (!hasUserInteractedRef.current) {
            fitGraph(activeSubsetRef.current);
          }
        }
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [containerRef, fitGraph]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((prev) => Math.min(maxZoom, +(prev * 1.2).toFixed(2)));
  }, [maxZoom]);

  const zoomOut = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((prev) => Math.max(minZoom, +(prev * 0.8).toFixed(2)));
  }, [minZoom]);

  const resetFit = useCallback(
    (subsetIds?: string[] | Set<string> | null) => {
      hasUserInteractedRef.current = false;
      fitGraph(subsetIds !== undefined ? subsetIds : null);
    },
    [fitGraph]
  );

  // Mouse pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      hasUserInteractedRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...pan };
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      hasUserInteractedRef.current = true;
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      setZoom((prev) => Math.max(minZoom, Math.min(maxZoom, +(prev * zoomFactor).toFixed(2))));
    },
    [minZoom, maxZoom]
  );

  return {
    zoom,
    pan,
    isDragging,
    fitGraph,
    zoomIn,
    zoomOut,
    resetFit,
    setPan,
    setZoom,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  };
}
