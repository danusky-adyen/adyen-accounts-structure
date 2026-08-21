/**
 * Card and tree geometry. Both the DOM renderer and the SVG exporter read these
 * numbers, so an exported diagram lines up with what is on screen.
 */

export const CARD = {
  minWidth: 176,
  maxWidth: 272,
  paddingX: 18,
  paddingTop: 16,
  paddingBottom: 15,
  radius: 18,
  iconSize: 40,
  iconGap: 10,
  nameSize: 14.5,
  nameWeight: 650,
  nameLineHeight: 19,
  nameMaxLines: 2,
  captionSize: 10.5,
  captionWeight: 600,
  captionLineHeight: 14,
  captionGap: 3,
  terminalGap: 9,
  terminalSize: 20,
  terminalSpacing: 5,
  terminalRowHeight: 22,

  /** Kind glyph shown over a brand mark, so the account type stays readable. */
  logoKindSize: 16,

  /** Integration chips. */
  chipHeight: 17,
  chipRadius: 6,
  chipPaddingX: 6,
  chipGap: 4,
  chipTextSize: 9.5,
  chipTextWeight: 600,
  chipRowGap: 9,
  chipMaxRows: 3,

  /** Payment-method brand marks. Ratio matches the vendored 40x26 artwork. */
  methodWidth: 25,
  methodHeight: 16,
  methodGap: 4,
  methodRowGap: 9,
  methodMaxRows: 2,
  methodRadius: 3,
  /** Width of the `+N` counter when methods overflow. */
  methodOverflowWidth: 20,

  /** Settings count. */
  badgeGap: 9,
  badgeHeight: 15,
  badgeTextSize: 9.5,
  badgeTextWeight: 600,
  badgeIconSize: 11,
  badgeIconGap: 4,
} as const;

export const TREE = {
  /** Horizontal space between neighbouring subtrees. */
  siblingGap: 26,
  /** Vertical space between one row of cards and the next. */
  rowGap: 58,
  /** Corner radius on the connector elbows. */
  elbowRadius: 12,
  /** Space kept around the diagram inside the exported image. */
  margin: 48,
} as const;

export const LINKS = {
  /** Distance from the deepest card to the first cross-link channel. */
  channelOffset: 30,
  /** Distance from a row of cards to the first lateral channel above it. */
  lateralOffset: 17,
  laneHeight: 11,
  /** How far a link attaches from the card's centre, to clear tree edges. */
  attachOffset: 22,
  handleDistance: 18,
} as const;
