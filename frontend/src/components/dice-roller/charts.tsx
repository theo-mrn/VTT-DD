'use client';

/**
 * Graphiques minimaux avec l'API de `recharts` utilisée par les statistiques
 * de l'ancienne app (absent du nouveau front) : `ResponsiveContainer`,
 * `LineChart`/`Line`, `BarChart`/`Bar` (horizontal ou `layout="vertical"`),
 * `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip content`. Rendu SVG et CSS,
 * info-bulle au survol.
 */
import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

type Datum = Record<string, string | number>;

interface AxisProps {
  dataKey?: string;
  type?: 'number' | 'category';
  width?: number;
  stroke?: string;
  fontSize?: number;
  tickLine?: boolean;
  axisLine?: boolean;
}
interface LineProps {
  dataKey: string;
  stroke?: string;
  strokeWidth?: number;
  type?: string;
  dot?: unknown;
  activeDot?: unknown;
  name?: string;
}
interface BarProps {
  dataKey: string;
  fill?: string;
  radius?: number[];
  name?: string;
}
interface TooltipProps {
  content?: ReactElement;
  cursor?: unknown;
}

// Marqueurs : lus par le graphique parent, jamais rendus seuls
export function XAxis(_props: AxisProps) {
  return null;
}
export function YAxis(_props: AxisProps) {
  return null;
}
export function CartesianGrid(_props: {
  strokeDasharray?: string;
  stroke?: string;
  vertical?: boolean;
  horizontal?: boolean;
}) {
  return null;
}
export function Tooltip(_props: TooltipProps) {
  return null;
}
export function Line(_props: LineProps) {
  return null;
}
export function Bar(_props: BarProps) {
  return null;
}

export function ResponsiveContainer({
  children,
}: {
  width?: string | number;
  height?: string | number;
  children: ReactNode;
}) {
  return <div className="h-full w-full">{children}</div>;
}

function find<P>(children: ReactNode, type: unknown): P | undefined {
  let found: P | undefined;
  Children.forEach(children, (c) => {
    if (!found && isValidElement(c) && c.type === type) found = c.props as P;
  });
  return found;
}

function Hover({
  tooltip,
  label,
  payload,
  style,
}: {
  tooltip: TooltipProps | undefined;
  label: ReactNode;
  payload: { name?: string; value: number | string; color?: string }[];
  style: CSSProperties;
}) {
  if (!tooltip?.content) return null;
  return (
    <div className="pointer-events-none absolute z-10" style={style}>
      {cloneElement(tooltip.content as ReactElement<Record<string, unknown>>, {
        active: true,
        payload,
        label,
      })}
    </div>
  );
}

function YTicks({ max, min, width = 20 }: { max: number; min: number; width?: number }) {
  return (
    <div
      className="flex shrink-0 flex-col justify-between py-0.5 text-right font-mono text-[9px] text-[rgba(255,255,255,0.3)]"
      style={{ width }}
    >
      <span>{Math.round(max)}</span>
      <span>{Math.round(min)}</span>
    </div>
  );
}

export function LineChart({ data, children }: { data: Datum[]; children: ReactNode }) {
  const line = find<LineProps>(children, Line);
  const x = find<AxisProps>(children, XAxis);
  const y = find<AxisProps>(children, YAxis);
  const tooltip = find<TooltipProps>(children, Tooltip);
  const [hover, setHover] = useState<number | null>(null);
  if (!line || !data.length) return null;
  const values = data.map((d) => Number(d[line.dataKey]) || 0);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 40;
  const px = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * w : w / 2);
  const py = (v: number) => h - ((v - min) / range) * h;
  const points = values.map((v, i) => `${px(i).toFixed(2)},${py(v).toFixed(2)}`).join(' ');
  return (
    <div className="flex h-full w-full gap-1">
      <YTicks max={max} min={min} width={y?.width ?? 20} />
      <div
        className="relative h-full flex-1"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - r.left) / Math.max(1, r.width);
          setHover(Math.round(ratio * (data.length - 1)));
        }}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={w}
              y1={h * f}
              y2={h * f}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {hover !== null && (
            <line
              x1={px(hover)}
              x2={px(hover)}
              y1={0}
              y2={h}
              stroke="rgba(255,255,255,0.1)"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polyline
            points={points}
            fill="none"
            stroke={line.stroke ?? 'currentColor'}
            strokeWidth={line.strokeWidth ?? 2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {hover !== null && data[hover] && (
          <Hover
            tooltip={tooltip}
            label={x?.dataKey ? data[hover][x.dataKey] : hover + 1}
            payload={[{ name: line.name ?? 'Total', value: values[hover]!, color: line.stroke }]}
            style={{
              left: `${(px(hover) / w) * 100}%`,
              top: 0,
              transform: `translateX(${px(hover) > w / 2 ? '-105%' : '5%'})`,
            }}
          />
        )}
      </div>
    </div>
  );
}

export function BarChart({
  data,
  layout = 'horizontal',
  children,
}: {
  data: Datum[];
  layout?: 'horizontal' | 'vertical';
  children: ReactNode;
}) {
  const bar = find<BarProps>(children, Bar);
  const x = find<AxisProps>(children, XAxis);
  const y = find<AxisProps>(children, YAxis);
  const tooltip = find<TooltipProps>(children, Tooltip);
  const [hover, setHover] = useState<number | null>(null);
  if (!bar || !data.length) return null;
  const values = data.map((d) => Number(d[bar.dataKey]) || 0);
  const max = Math.max(1, ...values);
  const category = layout === 'vertical' ? y?.dataKey : x?.dataKey;
  const labelOf = (i: number) => (category ? data[i]![category] : i + 1);
  const payload = (i: number) => [{ name: bar.name, value: values[i]!, color: bar.fill }];

  if (layout === 'vertical') {
    return (
      <div
        className="relative flex h-full w-full flex-col justify-around gap-1"
        onMouseLeave={() => setHover(null)}
      >
        {data.map((_, i) => (
          <div
            key={i}
            className="flex min-h-0 flex-1 items-center gap-2"
            onMouseEnter={() => setHover(i)}
          >
            <span
              className="shrink-0 truncate text-right text-[9px] text-[rgba(255,255,255,0.4)]"
              style={{ width: y?.width ?? 60 }}
            >
              {String(labelOf(i))}
            </span>
            <span className="h-3/5 max-h-4 flex-1">
              <span
                className="block h-full rounded-r"
                style={{ width: `${(values[i]! / max) * 100}%`, background: bar.fill }}
              />
            </span>
          </div>
        ))}
        {hover !== null && (
          <Hover
            tooltip={tooltip}
            label={labelOf(hover)}
            payload={payload(hover)}
            style={{ right: 0, top: `${(hover / data.length) * 100}%` }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full gap-1">
      <YTicks max={max} min={0} width={y?.width ?? 20} />
      <div
        className="relative flex h-full flex-1 items-end gap-px"
        onMouseLeave={() => setHover(null)}
      >
        {data.map((_, i) => (
          <div
            key={i}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
            onMouseEnter={() => setHover(i)}
            style={hover === i ? { background: 'rgba(255,255,255,0.05)' } : undefined}
          >
            <span
              className="w-full rounded-t"
              style={{
                height: `calc((100% - 12px) * ${values[i]! / max})`,
                minHeight: values[i] ? 2 : 0,
                background: bar.fill,
              }}
            />
            <span className="h-[10px] font-mono text-[8px] leading-none text-[rgba(255,255,255,0.3)]">
              {data.length <= 20 || i % 5 === 4 || i === 0 ? String(labelOf(i)) : ''}
            </span>
          </div>
        ))}
        {hover !== null && (
          <Hover
            tooltip={tooltip}
            label={labelOf(hover)}
            payload={payload(hover)}
            style={{
              left: `${((hover + 0.5) / data.length) * 100}%`,
              top: 0,
              transform: `translateX(${hover > data.length / 2 ? '-105%' : '5%'})`,
            }}
          />
        )}
      </div>
    </div>
  );
}
