import { useMemo, useState } from 'react';
import { goodsImageCandidates } from '../utils';

interface Props {
  info: {
    image?: string | null;
    localcode?: string;
    localCode?: string;
    barcode?: string;
    barcodes?: string[];
  };
  fallbackLocal?: string;
  fallbackBarcode?: string;
  alt: string;
  className: string;
  placeholderClassName?: string;
}

export function ProductImage({
  info,
  fallbackLocal = '',
  fallbackBarcode = '',
  alt,
  className,
  placeholderClassName,
}: Props) {
  const sources = useMemo(
    () => goodsImageCandidates(info, fallbackLocal, fallbackBarcode),
    [info, fallbackLocal, fallbackBarcode],
  );
  const [index, setIndex] = useState(0);
  const src = sources[index] ?? null;

  if (!src) {
    return (
      <div className={placeholderClassName || `${className} placeholder`} aria-hidden>
        📦
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => {
        setIndex((i) => (i + 1 < sources.length ? i + 1 : sources.length));
      }}
    />
  );
}
