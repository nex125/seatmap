import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function SeatIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M7 12.5V9.4a2.4 2.4 0 1 1 4.8 0v3.1" strokeLinecap="round" />
      <path d="M5 17v-3.1a1.9 1.9 0 0 1 1.9-1.9h8.2a1.9 1.9 0 0 1 1.9 1.9V17" strokeLinecap="round" />
      <path d="M4.8 17.8h14.4" strokeLinecap="round" />
    </svg>
  );
}

export function FitIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M9 4.8H4.8V9M15 4.8h4.2V9M9 19.2H4.8V15M15 19.2h4.2V15" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1.4" />
    </svg>
  );
}
