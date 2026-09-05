import React from 'react';

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <div
      aria-label="Society of Innovative Computing"
      className={`grid size-11 shrink-0 place-items-center rounded-full border-2 border-[#9ef0dc] bg-[#0e473d] text-xs font-black text-[#e8fff5] shadow-[inset_0_0_0_3px_#0e473d,inset_0_0_0_4px_#9ef0dc] ${className}`}
    >
      SIC
    </div>
  );
}
