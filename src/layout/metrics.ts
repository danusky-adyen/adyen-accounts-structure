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
