import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface ItemImageProps {
  src?: string;
  alt?: string;
  className?: string;
  iconSize?: number;
}

/** Item photo with a graceful fallback when the source is missing or fails to load. */
export default function ItemImage({ src, alt, className, iconSize = 24 }: ItemImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-muted/70 ${className ?? ''}`} data-testid="img-fallback">
        <ImageIcon className="text-border" size={iconSize} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
