/**
 * Icons are plain data rather than JSX so the same definition can be rendered
 * by React on screen and serialised by the SVG exporter. Every icon is drawn on
 * a 48x48 grid with a 2px stroke.
 *
 * `role: 'fill'` shapes take the node's tint colour, `role: 'line'` shapes take
 * the tint's line colour as a stroke.
 */

export interface IconShape {
  d: string;
  role: 'line' | 'fill' | 'solid';
  /** Overrides the default stroke width of 2. */
  width?: number;
  linecap?: 'round' | 'butt';
}

export interface IconDef {
  viewBox: string;
  shapes: readonly IconShape[];
}

const ICONS = {
  company: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M13 40V13a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v27', role: 'fill' },
      { d: 'M13 40V13a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v27', role: 'line' },
      { d: 'M8 40h32', role: 'line', linecap: 'round' },
      { d: 'M18 17h4v4h-4zM26 17h4v4h-4zM18 25h4v4h-4zM26 25h4v4h-4z', role: 'line', width: 1.7 },
      { d: 'M21 40v-6h6v6', role: 'line' },
    ],
  },
  pos: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M13 17h22v21a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2z', role: 'fill' },
      { d: 'M13 17h22v21a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2z', role: 'line' },
      { d: 'M17 21h14v8H17z', role: 'line', width: 1.7 },
      { d: 'M18 33h3M22.5 33h3M27 33h3', role: 'line', width: 1.9, linecap: 'round' },
      { d: 'M18 36.5h3M22.5 36.5h3M27 36.5h3', role: 'line', width: 1.9, linecap: 'round' },
      { d: 'M17 17v-5h14v5', role: 'line' },
    ],
  },
  ecom: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M8 14a2 2 0 0 1 2-2h28a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z', role: 'fill' },
      { d: 'M8 14a2 2 0 0 1 2-2h28a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z', role: 'line' },
      { d: 'M8 19h32', role: 'line' },
      { d: 'M19 41h10', role: 'line', linecap: 'round' },
      { d: 'M24 36v5', role: 'line', linecap: 'round' },
      { d: 'M13 15.5h.01M17 15.5h.01', role: 'line', width: 2.4, linecap: 'round' },
    ],
  },
  bp: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M24 8a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'fill' },
      { d: 'M13 28a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'fill' },
      { d: 'M35 28a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'fill' },
      { d: 'M24 8a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'line' },
      { d: 'M13 28a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'line' },
      { d: 'M35 28a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'line' },
      { d: 'M20 19 16 28M28 19l4 9M19 34h10', role: 'line', linecap: 'round' },
    ],
  },
  store: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M11 21h26v17a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2z', role: 'fill' },
      { d: 'M11 21h26v17a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2z', role: 'line' },
      { d: 'M8 21l4-9h24l4 9', role: 'line', linecap: 'round' },
      { d: 'M20 40V29h8v11', role: 'line' },
    ],
  },
  accHolder: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M24 10a7 7 0 1 1 0 14 7 7 0 0 1 0-14z', role: 'fill' },
      { d: 'M24 10a7 7 0 1 1 0 14 7 7 0 0 1 0-14z', role: 'line' },
      { d: 'M11 40a13 13 0 0 1 26 0', role: 'line', linecap: 'round' },
    ],
  },
  liableAccHolder: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M19 9a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'fill' },
      { d: 'M19 9a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', role: 'line' },
      { d: 'M7 38a12 12 0 0 1 21-7.9', role: 'line', linecap: 'round' },
      { d: 'M33 24l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9v-6z', role: 'fill' },
      { d: 'M33 24l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9v-6z', role: 'line' },
    ],
  },
  legalEntity: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M13 9h16l6 6v24a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2z', role: 'fill' },
      { d: 'M13 9h16l6 6v24a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2z', role: 'line' },
      { d: 'M29 9v6h6', role: 'line' },
      { d: 'M19 24h10M19 30h10M19 36h6', role: 'line', linecap: 'round' },
    ],
  },
  businessLine: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M10 30h8v11h-8zM20 21h8v20h-8zM30 25h8v16h-8z', role: 'fill' },
      { d: 'M10 30h8v11h-8zM20 21h8v20h-8zM30 25h8v16h-8z', role: 'line' },
      { d: 'M8 41h32', role: 'line', linecap: 'round' },
      { d: 'M14 25V14M11 17l3-3 3 3', role: 'line', linecap: 'round' },
    ],
  },
  transferInst: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M10 11h17a2 2 0 0 1 2 2v22a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z', role: 'fill' },
      { d: 'M10 11h17a2 2 0 0 1 2 2v22a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z', role: 'line' },
      { d: 'M14 19h9M14 25h6', role: 'line', linecap: 'round' },
      { d: 'M24 30h17M34 23l7 7-7 7', role: 'line', linecap: 'round' },
    ],
  },
  balanceAcc: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M8 15a2 2 0 0 1 2-2h28a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z', role: 'fill' },
      { d: 'M8 15a2 2 0 0 1 2-2h28a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z', role: 'line' },
      { d: 'M40 20H29a4 4 0 0 0 0 8h11', role: 'line' },
      { d: 'M32.5 24h.01', role: 'line', width: 3, linecap: 'round' },
    ],
  },
  grantAcc: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M10 30h28v5c0 2.2-6.3 4-14 4s-14-1.8-14-4z', role: 'fill' },
      { d: 'M24 26c7.7 0 14 1.8 14 4s-6.3 4-14 4-14-1.8-14-4 6.3-4 14-4z', role: 'fill' },
      { d: 'M24 26c7.7 0 14 1.8 14 4s-6.3 4-14 4-14-1.8-14-4 6.3-4 14-4z', role: 'line' },
      { d: 'M10 30v5c0 2.2 6.3 4 14 4s14-1.8 14-4v-5', role: 'line', linecap: 'round' },
      { d: 'M14 20c5.5 0 10 1.6 10 3.5S19.5 27 14 27 4 25.4 4 23.5 8.5 20 14 20z', role: 'fill' },
      { d: 'M24 12c5.5 0 10 1.6 10 3.5S29.5 19 24 19s-10-1.6-10-3.5S18.5 12 24 12z', role: 'line' },
      { d: 'M14 15.5v4c0 1.9 4.5 3.5 10 3.5s10-1.6 10-3.5v-4', role: 'line', linecap: 'round' },
    ],
  },
  payInstCard: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M6 16a2 2 0 0 1 2-2h32a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z', role: 'fill' },
      { d: 'M6 16a2 2 0 0 1 2-2h32a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z', role: 'line' },
      { d: 'M6 21h36', role: 'line', width: 4 },
      { d: 'M12 28h8', role: 'line', linecap: 'round' },
    ],
  },
  payInstBiz: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M9 13h30a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2z', role: 'fill' },
      { d: 'M9 13h30a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2z', role: 'line' },
      { d: 'M14 21h9M14 27h13', role: 'line', linecap: 'round' },
      { d: 'M35 19.5a4.5 4.5 0 1 0 0 9', role: 'line', linecap: 'round' },
      { d: 'M29 22.5h6M29 25.5h5', role: 'line', width: 1.7, linecap: 'round' },
    ],
  },
  grantRef: {
    viewBox: '0 0 48 48',
    shapes: [
      { d: 'M14 9h20v30l-4-2.5-4 2.5-4-2.5-4 2.5-4-2.5z', role: 'fill' },
      { d: 'M14 9h20v30l-4-2.5-4 2.5-4-2.5-4 2.5-4-2.5z', role: 'line' },
      { d: 'M19 17h10M19 23h10M19 29h6', role: 'line', linecap: 'round' },
    ],
  },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export function getIcon(name: IconName): IconDef {
  return ICONS[name];
}

/** Small glyphs for the terminal chips shown on store cards. */
const TERMINAL_ICONS = {
  counter: {
    viewBox: '0 0 24 24',
    shapes: [
      { d: 'M6 3h12v18H6z', role: 'fill' },
      { d: 'M6 3h12v18H6z', role: 'line', width: 1.6 },
      { d: 'M8.5 6h7v4h-7z', role: 'line', width: 1.6 },
      { d: 'M9 14h.01M12 14h.01M15 14h.01M9 17.5h.01M12 17.5h.01M15 17.5h.01', role: 'line', width: 1.8, linecap: 'round' },
    ],
  },
  mobile: {
    viewBox: '0 0 24 24',
    shapes: [
      { d: 'M7 2h10v20H7z', role: 'fill' },
      { d: 'M7 2h10v20H7z', role: 'line', width: 1.6 },
      { d: 'M10 19.5h4', role: 'line', width: 1.6, linecap: 'round' },
      { d: 'M9.5 5.5h5v9h-5z', role: 'line', width: 1.4 },
    ],
  },
  reader: {
    viewBox: '0 0 24 24',
    shapes: [
      { d: 'M6 3h12v18H6z', role: 'fill' },
      { d: 'M6 3h12v18H6z', role: 'line', width: 1.6 },
      { d: 'M10 8c1.7 0 3 .9 3 2M10 11c1 0 1.8.5 1.8 1.2', role: 'line', width: 1.6, linecap: 'round' },
      { d: 'M12 17.5h.01', role: 'line', width: 1.8, linecap: 'round' },
    ],
  },
  unattended: {
    viewBox: '0 0 24 24',
    shapes: [
      { d: 'M4 3h16v13H4z', role: 'fill' },
      { d: 'M4 3h16v13H4z', role: 'line', width: 1.6 },
      { d: 'M7 6h10v6H7z', role: 'line', width: 1.4 },
      { d: 'M9 16v5M15 16v5M7 21h10', role: 'line', width: 1.6, linecap: 'round' },
    ],
  },
} as const satisfies Record<string, IconDef>;

export type TerminalIconName = keyof typeof TERMINAL_ICONS;

export function getTerminalIcon(name: TerminalIconName): IconDef {
  return TERMINAL_ICONS[name];
}
