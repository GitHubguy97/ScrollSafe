import React from "react";

type BrandBadgeProps = {
  className?: string;
};

const BrandBadge: React.FC<BrandBadgeProps> = ({ className }) => (
  <div
    className={`inline-flex items-center justify-center rounded-2xl p-1 shadow-[0_4px_12px_rgba(17,91,255,0.25)] bg-gradient-to-br from-[#2d7bff] to-[#58c8ff] ${className ?? ""}`}
    aria-hidden="true"
  >
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="12" fill="url(#shieldGradient)" />
      <path
        d="M16 8L11 10V16C11 19 13.1 22.3 16 23.5C18.9 22.3 21 19 21 16V10L16 8Z"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id="shieldGradient" x1="5" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2a7dff" />
          <stop offset="1" stopColor="#58c8ff" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

export default BrandBadge;
