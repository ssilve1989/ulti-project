import { useEffect, useState } from 'react';
import {
  getIconDimensions,
  getOptimalIconFormat,
} from '../lib/utils/iconUtils.js';

interface OptimizedIconProps {
  /** The base icon path (without extension, relative to /icons/) */
  iconPath: string;
  /** Alternative text for accessibility */
  alt: string;
  /** CSS classes for styling */
  className?: string;
  /** Loading strategy - 'lazy' (default) or 'eager' */
  loading?: 'lazy' | 'eager';
  /** Icon type for automatic dimension calculation */
  type?: 'role' | 'job';
  /** Manual width override */
  width?: number;
  /** Manual height override */
  height?: number;
  /** Callback for load errors */
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  /** Whether to prefer WebP format */
  preferWebP?: boolean;
}

/**
 * Optimized icon component for React that provides:
 * - Automatic WebP format selection with PNG fallback
 * - Proper dimensions to prevent CLS
 * - Lazy loading by default
 * - Error handling with graceful degradation
 */
export function OptimizedIcon({
  iconPath,
  alt,
  className = '',
  loading = 'lazy',
  type,
  width,
  height,
  onError,
  preferWebP = true,
}: OptimizedIconProps) {
  // Calculate the optimal image source immediately to avoid empty src
  const optimalSrc = getOptimalIconFormat(iconPath, preferWebP);
  const [imageSrc, setImageSrc] = useState<string>(optimalSrc);
  const [hasError, setHasError] = useState(false);

  // Determine dimensions
  const dimensions = type
    ? getIconDimensions(type)
    : { width: width || 24, height: height || 24 };
  const finalWidth = width || dimensions.width;
  const finalHeight = height || dimensions.height;

  useEffect(() => {
    // Update image source when props change
    const newOptimalSrc = getOptimalIconFormat(iconPath, preferWebP);
    setImageSrc(newOptimalSrc);
    setHasError(false);
  }, [iconPath, preferWebP]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!hasError && preferWebP && imageSrc.includes('.webp')) {
      // Fallback to PNG if WebP fails
      const pngSrc = imageSrc.replace('.webp', '.png');
      setImageSrc(pngSrc);
      setHasError(true);
    } else {
      // Call custom error handler or hide the image
      if (onError) {
        onError(e);
      } else {
        // Default behavior: hide the image
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
      }
    }
  };

  const handleLoad = () => {
    // Reset error state on successful load
    setHasError(false);
  };

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      loading={loading}
      width={finalWidth}
      height={finalHeight}
      onError={handleError}
      onLoad={handleLoad}
      style={{
        // Ensure dimensions are set even if CSS doesn't specify them
        width: finalWidth,
        height: finalHeight,
      }}
    />
  );
}

export default OptimizedIcon;
