import { useCallback, useState, type CSSProperties, type SyntheticEvent } from "react";

interface ImageDims {
  w: number;
  h: number;
}

const naturalDimsCache = new Map<string, ImageDims>();

function computeBoundedWidth(
  dims: ImageDims | undefined,
  maxWidth: number,
  maxHeight: number,
): number | undefined {
  if (!dims || dims.w <= 0 || dims.h <= 0) return undefined;
  const scale = Math.min(1, maxWidth / dims.w, maxHeight / dims.h);
  return Math.max(48, Math.round(dims.w * scale));
}

export interface ChatAttachmentImageProps {
  src: string;
  alt: string;
  className?: string;
  maxWidth?: number;
  maxHeight?: number;
  loading?: "lazy" | "eager";
  style?: CSSProperties;
  onLoad?: () => void;
}

/**
 * Renders an attachment or sticker image with an explicit aspect-ratio-bounded inline width
 * so parent `width: fit-content` bubbles (including custom DecoratedMessageBubble themes)
 * shrink-wrap tightly around tall portrait screenshots instead of stretching to max-content!
 */
export function ChatAttachmentImage({
  src,
  alt,
  className = "msg-image",
  maxWidth = 420,
  maxHeight = 420,
  loading = "lazy",
  style,
  onLoad,
}: ChatAttachmentImageProps) {
  const [measured, setMeasured] = useState<{ src: string; dims: ImageDims } | null>(null);

  const handleImgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && !naturalDimsCache.has(src) && el.complete && el.naturalWidth > 0 && el.naturalHeight > 0) {
        const next = { w: el.naturalWidth, h: el.naturalHeight };
        naturalDimsCache.set(src, next);
        setMeasured((prev) =>
          prev && prev.src === src && prev.dims.w === next.w && prev.dims.h === next.h
            ? prev
            : { src, dims: next },
        );
      }
    },
    [src],
  );

  function handleImgLoad(event: SyntheticEvent<HTMLImageElement>) {
    const el = event.currentTarget;
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
      const next = { w: el.naturalWidth, h: el.naturalHeight };
      naturalDimsCache.set(src, next);
      setMeasured((prev) =>
        prev && prev.src === src && prev.dims.w === next.w && prev.dims.h === next.h
          ? prev
          : { src, dims: next },
      );
    }
    onLoad?.();
  }

  const dims = naturalDimsCache.get(src) ?? (measured?.src === src ? measured.dims : undefined);
  const fittedWidth = computeBoundedWidth(dims, maxWidth, maxHeight);
  const resolvedStyle: CSSProperties | undefined = fittedWidth
    ? {
        width: `${fittedWidth}px`,
        maxWidth: "100%",
        height: "auto",
        ...style,
      }
    : style;

  return (
    <img
      ref={handleImgRef}
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      style={resolvedStyle}
      onLoad={handleImgLoad}
    />
  );
}
