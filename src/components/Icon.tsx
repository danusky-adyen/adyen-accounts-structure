import { memo } from 'react';
import { getIcon, getTerminalIcon, type IconDef, type IconName, type TerminalIconName } from '../design/icons';
import type { TintName } from '../design/palette';

interface ShapeProps {
  readonly def: IconDef;
  readonly tint: TintName;
}

function Shapes({ def, tint }: ShapeProps) {
  return (
    <>
      {def.shapes.map((shape, index) => {
        const key = `${shape.role}-${index}`;
        if (shape.role === 'fill') {
          return <path key={key} d={shape.d} fill={`var(--tint-${tint}-fill)`} stroke="none" />;
        }
        if (shape.role === 'solid') {
          return <path key={key} d={shape.d} fill={`var(--tint-${tint}-line)`} stroke="none" />;
        }
        return (
          <path
            key={key}
            d={shape.d}
            fill="none"
            stroke={`var(--tint-${tint}-line)`}
            strokeWidth={shape.width ?? 2}
            strokeLinecap={shape.linecap ?? 'butt'}
            strokeLinejoin="round"
          />
        );
      })}
    </>
  );
}

interface IconProps {
  readonly name: IconName;
  readonly tint: TintName;
  readonly size: number;
}

export const Icon = memo(function Icon({ name, tint, size }: IconProps) {
  const def = getIcon(name);
  return (
    <svg viewBox={def.viewBox} width={size} height={size} aria-hidden focusable="false">
      <Shapes def={def} tint={tint} />
    </svg>
  );
});

interface TerminalIconProps {
  readonly name: TerminalIconName;
  readonly size: number;
  readonly tint?: TintName;
}

export const TerminalIcon = memo(function TerminalIcon({ name, size, tint = 'green' }: TerminalIconProps) {
  const def = getTerminalIcon(name);
  return (
    <svg viewBox={def.viewBox} width={size} height={size} aria-hidden focusable="false">
      <Shapes def={def} tint={tint} />
    </svg>
  );
});
