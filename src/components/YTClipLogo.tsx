import React from 'react';

interface YTClipLogoProps {
  size?: 'sm' | 'md';
}

export const YTClipLogo: React.FC<YTClipLogoProps> = ({ size = 'md' }) => {
  const iconBox = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-lg' : 'text-xl';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconBox} shrink-0`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ytclipGrad" x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="32" height="32" rx="9" fill="url(#ytclipGrad)" />
        {/* Vertical short frame cutout with play triangle */}
        <rect
          x="10.5"
          y="7.5"
          width="15"
          height="21"
          rx="3.5"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="2"
        />
        <path d="M16 14.2L22 18L16 21.8V14.2Z" fill="#FFFFFF" />
        {/* Precision trim tick */}
        <path d="M6.5 13H8.5M6.5 23H8.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className={`font-display font-bold tracking-tight text-white ${textSize}`}>
        YTClip
      </span>
    </span>
  );
};
