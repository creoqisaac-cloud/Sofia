/** Íconos de línea fina (sin emojis decorativos). */
import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const IconHome = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" /></svg>);
export const IconPeople = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.6.6 2.7 2 3 4.2" /></svg>);
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></svg>);
export const IconCar = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 16.5V12l1.8-4.2A2 2 0 0 1 8.6 6.5h6.8a2 2 0 0 1 1.8 1.3L19 12v4.5" /><path d="M4 16.5h16v2a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-.5h-9v.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M5.5 12h13" /></svg>);
export const IconMore = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></svg>);
export const IconMic = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></svg>);
export const IconSend = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 12h13M13 6l6 6-6 6" /></svg>);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>);
export const IconPhone = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 5 5.6 1.5 1.5 0 0 1 6.5 4z" /></svg>);
export const IconDoc = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z" /><path d="M14 3.5V8h4M9.5 12h6M9.5 15.5h6" /></svg>);
export const IconPlate = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 12h2M11 12h2M15 12h2" /></svg>);
export const IconUpload = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>);
export const IconShare = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" /></svg>);
