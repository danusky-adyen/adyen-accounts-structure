/**
 * Card and tree geometry. Both the DOM renderer and the SVG exporter read these
 * numbers, so an exported diagram lines up with what is on screen.
 *
 * Sizes come from Bento: every gap is a step on the spacer ramp, radii are the
 * Bento radius scale, and text uses the Bento type scale (`body` for names,
 * `caption` for everything secondary). See `src/design/tokens.ts`.
 */

import { RADIUS, SPACER, TYPE } from '../design/tokens';

export const CARD = {
  minWidth: 176,
  maxWidth: 272,
  paddingX: SPACER['070'],
  paddingTop: SPACER['070'],
  paddingBottom: SPACER['070'],
  radius: RADIUS.l,
  iconSize: 40,
  iconGap: SPACER['060'],
  nameSize: TYPE.bodyStrongest.size,
  nameWeight: TYPE.bodyStrongest.weight,
  nameLineHeight: TYPE.bodyStrongest.lineHeight,
  nameMaxLines: 2,
  captionSize: TYPE.caption.size,
  captionWeight: TYPE.caption.weight,
  captionLineHeight: TYPE.caption.lineHeight,
  captionGap: SPACER['000'],
  terminalGap: SPACER['060'],
  terminalSize: 20,
  terminalSpacing: SPACER['020'],
  terminalRowHeight: 22,

  /** Kind glyph shown over a brand mark, so the account type stays readable. */
  logoKindSize: 16,

  /** Integration chips. Bento tag: 2px/8px padding on the caption line-height. */
  chipHeight: TYPE.caption.lineHeight + 2 * SPACER['010'],
  chipRadius: RADIUS.s,
  chipPaddingX: SPACER['040'],
  chipGap: SPACER['020'],
  chipTextSize: TYPE.captionStronger.size,
  chipTextWeight: TYPE.captionStronger.weight,
  chipRowGap: SPACER['060'],
  chipMaxRows: 3,

  /** Payment-method brand marks. Ratio matches the vendored 40x26 artwork. */
  methodWidth: 25,
  methodHeight: 16,
  methodGap: SPACER['020'],
  methodRowGap: SPACER['060'],
  methodMaxRows: 2,
  methodRadius: RADIUS.s,
  /** Width of the `+N` counter when methods overflow. */
  methodOverflowWidth: 20,

  /** Settings count. */
  badgeGap: SPACER['060'],
  badgeHeight: TYPE.caption.lineHeight,
  badgeTextSize: TYPE.caption.size,
  badgeTextWeight: TYPE.captionStronger.weight,
  badgeIconSize: 12,
  badgeIconGap: SPACER['020'],
} as const;

export const TREE = {
  /** Horizontal space between neighbouring subtrees. */
  siblingGap: SPACER['090'],
  /** Vertical space between one row of cards and the next. */
  rowGap: SPACER['130'],
  /** Corner radius on the connector elbows. */
  elbowRadius: RADIUS.l,
  /** Space kept around the diagram inside the exported image. */
  margin: SPACER['120'],
} as const;

export const LINKS = {
  /** Distance from the deepest card to the first cross-link channel. */
  channelOffset: SPACER['100'],
  /** Distance from a row of cards to the first lateral channel above it. */
  lateralOffset: SPACER['070'],
  laneHeight: SPACER['060'],
  /** How far a link attaches from the card's centre, to clear tree edges. */
  attachOffset: SPACER['090'],
  handleDistance: SPACER['070'],
} as const;
