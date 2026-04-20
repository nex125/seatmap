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

export function SectionAreaIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M9 9h6M9 15h6" strokeLinecap="round" />
    </svg>
  );
}

export function StageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M5 17.5h14" strokeLinecap="round" />
      <path d="M7.2 17.5V10l4.8-3 4.8 3v7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7V4.8" strokeLinecap="round" />
    </svg>
  );
}

export function DancefloorIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <rect x="4.8" y="4.8" width="14.4" height="14.4" rx="2.2" />
      <path d="M9.2 4.8v14.4M14.8 4.8v14.4M4.8 9.2h14.4M4.8 14.8h14.4" strokeLinecap="round" />
    </svg>
  );
}

export function RectangleShapeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <rect x="5" y="7" width="14" height="10" rx="1.8" />
    </svg>
  );
}

export function PolygonShapeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <g transform="rotate(-24 12 12)">
        <path d="M12 5.2 18.5 17H5.5L12 5.2Z" strokeLinejoin="round" />
        <circle cx="12" cy="5.2" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="18.5" cy="17" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="5.5" cy="17" r="1.4" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
