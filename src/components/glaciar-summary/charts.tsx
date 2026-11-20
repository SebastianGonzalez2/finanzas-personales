"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatBankAmount } from "@/domain/bank-balances";
import type { Currency } from "@/domain/money";

export type CashflowPoint = {
  period: string;
  label: string;
  income: string | null;
  expense: string | null;
  result: string | null;
  inProgress?: boolean;
};

function compact(value: number) {
  return value >= 1000
    ? `${(value / 1000)
        .toFixed(value >= 100000 ? 0 : 1)
        .replace(/\.0$/, "")
        .replace(".", ",")} k`
    : value.toFixed(0);
}

function money(amount: string | null, currency: Currency) {
  return amount === null ? "Sin datos" : formatBankAmount({ amount, currency });
}

// UI-01 — Gráficos SVG sin dependencias. Reglas: un solo eje, marcas finas,
// separación de 2 px entre rellenos, leyenda siempre presente con ≥ 2 series,
// tooltip por puntero y por teclado, y tabla equivalente para no depender del
// color ni del puntero.

export const seriesColors = { income: "#199e70", expense: "#9085e9" } as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (step / 2)) * (step / 2);
}

/** Barra con extremo de datos redondeado (4 px) y base recta sobre el eje. */
function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  up = true,
) {
  const r = Math.min(4, width / 2, Math.abs(height));
  if (height <= 0) return "";
  if (up)
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  return `M${x},${y}V${y + height - r}Q${x},${y + height} ${x + r},${y + height}H${x + width - r}Q${x + width},${y + height} ${x + width},${y + height - r}V${y}Z`;
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; shape?: "rect" | "line" }[];
}) {
  return (
    <ul className="lab-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            aria-hidden="true"
            className={item.shape === "line" ? "lab-key-line" : "lab-key-rect"}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({
  x,
  width,
  children,
}: {
  x: number;
  width: number;
  children: ReactNode;
}) {
  const inset = Math.min(114, width / 2);
  const left = Math.min(Math.max(x, inset), width - inset);
  return (
    <div role="status" className="lab-tooltip" style={{ left }}>
      {children}
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <p className="lab-tooltip__row">
      <span
        aria-hidden="true"
        className="lab-key-line"
        style={{ background: color }}
      />
      <strong>{value}</strong>
      <span>{label}</span>
    </p>
  );
}

export function CashflowChart({
  data: points,
  currency = "UYU",
  height = 240,
}: {
  data: readonly CashflowPoint[];
  currency?: Currency;
  height?: number;
}) {
  const data = points.map((point) => ({
    ...point,
    income: Number(point.income),
    expense: Number(point.expense),
  }));
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const active = hovered ?? focused;
  const gradient = useId().replace(/:/g, "");
  const pad = {
    top: 26,
    right: 8,
    bottom: 28,
    left: 44,
  };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(
    Math.max(...data.map((d) => Math.max(d.income, d.expense))),
  );
  const step = plotW / data.length;
  const zero = pad.top + plotH / 2;
  const scale = plotH / 2 / max;
  const ticks = [max, max / 2, 0, max / 2, max];
  const center = (i: number) => pad.left + step * i + step / 2;

  const label = (d: CashflowPoint) =>
    `${d.label}${d.inProgress ? " (mes en curso)" : ""}: ingresos ${money(d.income, currency)}, gastos ${money(d.expense, currency)}, resultado ${money(d.result, currency)}`;

  return (
    <div className="lab-chart">
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        onPointerLeave={() => setHovered(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="group"
            aria-label={`Ingresos y gastos de los últimos seis meses en ${currency}`}
            className="block overflow-visible"
          >
            <defs>
              <pattern
                id={`${gradient}-hatch`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="currentColor" opacity="0.18" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  opacity="0.55"
                />
              </pattern>
            </defs>
            {ticks.map((tick, i) => {
              const y = pad.top + (plotH / 4) * i;
              return (
                <g key={i} className="lab-grid">
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    strokeDasharray={tick === 0 ? undefined : "2 4"}
                  />
                  <text x={pad.left - 10} y={y} dy="0.32em" textAnchor="end">
                    {tick === 0 ? "0" : `${i > 2 ? "−" : ""}${compact(tick)}`}
                  </text>
                </g>
              );
            })}
            {active !== null && (
              <rect
                className="lab-hover-band"
                x={pad.left + step * active + 4}
                width={Math.max(1, step - 8)}
                y={pad.top}
                height={plotH}
                rx="8"
              />
            )}

            {data.map((d, i) => {
              const barW = Math.min(26, Math.max(1, step - 16));
              const muted = active !== null && active !== i;
              const x = center(i) - barW / 2;
              const incomeH = d.income * scale;
              const expenseH = d.expense * scale;
              const net = Number(d.result);
              return (
                <g
                  key={d.period}
                  className={`lab-bar-group${muted ? " is-muted" : ""}`}
                >
                  <path
                    d={barPath(x, zero - incomeH - 1, barW, incomeH, true)}
                    fill={seriesColors.income}
                  />
                  <path
                    d={barPath(x, zero + 1, barW, expenseH, false)}
                    fill={seriesColors.expense}
                  />
                  {d.inProgress && (
                    <path
                      d={barPath(x, zero + 1, barW, expenseH, false)}
                      fill={`url(#${gradient}-hatch)`}
                      className="text-[#0b1220]"
                    />
                  )}
                  {/* Etiqueta directa del resultado solo si hay espacio;
                      en pantallas angostas vive en el tooltip y la tabla. */}
                  {step >= 56 && d.result !== null && (
                    <text
                      className="lab-net-label"
                      x={center(i)}
                      y={zero - incomeH - 10}
                      textAnchor="middle"
                    >
                      {net >= 0 ? "+" : "−"}
                      {compact(Math.abs(net))}
                    </text>
                  )}
                </g>
              );
            })}

            {data.map((d, i) => (
              <g key={d.period}>
                <text
                  className={`lab-axis-x${active === i ? " is-active" : ""}`}
                  x={center(i)}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {d.label}
                  {d.inProgress ? " ·" : ""}
                </text>
                <rect
                  x={pad.left + step * i}
                  y={pad.top}
                  width={step}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={label(points[i])}
                  className="lab-hit"
                  onPointerEnter={() => setHovered(i)}
                  onFocus={() => setFocused(i)}
                  onBlur={() => setFocused(null)}
                />
              </g>
            ))}
          </svg>
        )}
        {active !== null && width > 0 && (
          <Tooltip x={center(active)} width={width}>
            <p className="lab-tooltip__title">
              {data[active].label} {data[active].period.slice(0, 4)}
              {data[active].inProgress ? " · en curso" : ""}
            </p>
            <TooltipRow
              color={seriesColors.income}
              label="Ingresos"
              value={money(points[active].income, currency)}
            />
            <TooltipRow
              color={seriesColors.expense}
              label="Gastos"
              value={money(points[active].expense, currency)}
            />
            <p className="lab-tooltip__foot">
              Resultado{" "}
              <strong>{money(points[active].result, currency)}</strong>
            </p>
          </Tooltip>
        )}
      </div>
      <div className="lab-chart__foot">
        <ChartLegend
          items={[
            {
              label: "Ingresos",
              color: seriesColors.income,
              shape: "rect",
            },
            {
              label: "Gastos",
              color: seriesColors.expense,
              shape: "rect",
            },
          ]}
        />
        <details className="lab-table-toggle">
          <summary>Ver como tabla</summary>
          <table className="lab-mini-table">
            <caption className="sr-only">
              Ingresos y gastos mensuales en {currency}
            </caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Ingresos</th>
                <th scope="col">Gastos</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {points.map((d) => (
                <tr key={d.period}>
                  <th scope="row">
                    {d.label}
                    {d.inProgress ? " (en curso)" : ""}
                  </th>
                  <td>{money(d.income, currency)}</td>
                  <td>{money(d.expense, currency)}</td>
                  <td>{money(d.result, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}

export type Category = {
  id?: string;
  name: string;
  amount: string;
  color: string;
};

function percent(value: number, total: number) {
  return `${((value / total) * 100).toFixed(1).replace(".", ",")} %`;
}

/** Anillo con total al centro; el foco o el puntero cambian la lectura central. */
export function CategoryDonut({
  data,
  total: exactTotal,
  currency = "UYU",
  size = 188,
}: {
  data: Category[];
  total: string;
  currency?: Currency;
  size?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = Number(exactTotal);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const gap = 4; // ≈ 2 px de superficie a cada lado del segmento
  const offsets = data.map((_, i) =>
    data
      .slice(0, i)
      .reduce((sum, d) => sum + (Number(d.amount) / total) * circumference, 0),
  );
  const current = active === null ? null : data[active];
  return (
    <div className="lab-donut">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Distribución de gastos del mes por categoría"
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className="lab-donut__track"
            strokeWidth="14"
          />
          {data.map((d, i) => {
            const length = (Number(d.amount) / total) * circumference;
            const dash = `${Math.max(0, length - gap)} ${circumference}`;
            return (
              <circle
                key={d.id ?? d.name}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={active === i ? 18 : 14}
                strokeDasharray={dash}
                strokeDashoffset={-offsets[i]}
                strokeLinecap="butt"
                className={`lab-donut__seg${active !== null && active !== i ? " is-muted" : ""}`}
                tabIndex={0}
                role="img"
                aria-label={`${d.name}: ${money(d.amount, currency)}, ${percent(Number(d.amount), total)}`}
                onPointerEnter={() => setActive(i)}
                onPointerMove={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            );
          })}
        </svg>
        <div className="lab-donut__center" aria-hidden="true">
          <span className="lab-donut__label">
            {current ? current.name : "Gastos del mes"}
          </span>
          <strong
            className="lab-donut__value"
            title={money(current?.amount ?? exactTotal, currency)}
          >
            {compact(current ? Number(current.amount) : total)}
          </strong>
          <span className="lab-donut__label">
            {current ? percent(Number(current.amount), total) : currency}
          </span>
        </div>
      </div>
      <div className="lab-donut__detail">
        <p className="sr-only">Gastos del mes: {money(exactTotal, currency)}</p>
        <ul className="lab-donut__legend" aria-label="Detalle por categoría">
          {data.map((d, i) => (
            <li
              key={d.id ?? d.name}
              className={active === i ? "is-active" : undefined}
            >
              <span
                aria-hidden="true"
                className="lab-key-rect"
                style={{ background: d.color }}
              />
              <span className="wrap-anywhere">{d.name}</span>
              <span className="ml-auto text-right wrap-anywhere tabular-nums">
                {money(d.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Tendencia mínima para tarjetas de indicadores (serie única, sin leyenda). */
export function Sparkline({
  values,
  color,
  label,
  width = 120,
  height = 36,
}: {
  values: (number | null)[];
  color: string;
  label: string;
  width?: number;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const measured = values.filter((value) => value !== null);
  if (measured.length < 2) return null;
  const min = Math.min(...measured);
  const max = Math.max(...measured);
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3;
  const y = (v: number) =>
    height - 4 - ((v - min) / (max - min || 1)) * (height - 10);
  const d = values
    .map((value, index) =>
      value === null
        ? ""
        : `${index > 0 && values[index - 1] !== null ? "L" : "M"}${x(index)},${y(value)}`,
    )
    .join("");
  const last = values.findLastIndex((value) => value !== null);
  const continuous = values.every((value) => value !== null);
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {continuous && (
        <path
          d={`${d}L${x(last)},${height}L${x(0)},${height}Z`}
          fill={`url(#${id})`}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(last)}
        cy={y(values[last]!)}
        r="3.5"
        fill={color}
        className="lab-dot-ring"
      />
    </svg>
  );
}

export function ProgressRing({
  value,
  color,
  size = 56,
  stroke = 6,
  children,
}: {
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="lab-donut__track"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, value) * circumference} ${circumference}`}
          className="lab-ring-fill"
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">
        {children}
      </span>
    </div>
  );
}

export type ExpensePoint = {
  period: string;
  label: string;
  expense: string | null;
  inProgress?: boolean;
};

/** SIMP-03 — Gastos de los últimos meses: una sola serie, barras desde el eje. */
export function ExpenseTrendChart({
  data: points,
  currency = "UYU",
  height = 240,
}: {
  data: readonly ExpensePoint[];
  currency?: Currency;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const active = hovered ?? focused;
  const gradient = useId().replace(/:/g, "");
  const data = points.map((point) => ({
    ...point,
    value: point.expense === null ? 0 : Number(point.expense),
  }));
  const pad = { top: 16, right: 8, bottom: 28, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map(({ value }) => value)));
  const step = plotW / Math.max(1, data.length);
  const scale = plotH / max;
  const base = pad.top + plotH;
  const ticks = [max, max / 2, 0];
  const center = (i: number) => pad.left + step * i + step / 2;
  const label = (d: ExpensePoint) =>
    `${d.label}${d.inProgress ? " (mes en curso)" : ""}: gastos ${money(d.expense, currency)}`;

  return (
    <div className="lab-chart">
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        onPointerLeave={() => setHovered(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="group"
            aria-label={`Gastos de los últimos meses en ${currency}`}
            className="block overflow-visible"
          >
            <defs>
              <pattern
                id={`${gradient}-hatch`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="currentColor" opacity="0.18" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  opacity="0.55"
                />
              </pattern>
            </defs>
            {ticks.map((tick, i) => {
              const y = pad.top + (plotH / 2) * i;
              return (
                <g key={i} className="lab-grid">
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    strokeDasharray={tick === 0 ? undefined : "2 4"}
                  />
                  <text x={pad.left - 10} y={y} dy="0.32em" textAnchor="end">
                    {tick === 0 ? "0" : compact(tick)}
                  </text>
                </g>
              );
            })}
            {active !== null && (
              <rect
                className="lab-hover-band"
                x={pad.left + step * active + 4}
                width={Math.max(1, step - 8)}
                y={pad.top}
                height={plotH}
                rx="8"
              />
            )}
            {data.map((d, i) => {
              const barW = Math.min(32, Math.max(1, step - 16));
              const barH = d.value * scale;
              const x = center(i) - barW / 2;
              return (
                <g
                  key={d.period}
                  className={`lab-bar-group${active !== null && active !== i ? " is-muted" : ""}`}
                >
                  <path
                    d={barPath(x, base - barH - 1, barW, barH, true)}
                    fill={seriesColors.expense}
                  />
                  {d.inProgress && (
                    <path
                      d={barPath(x, base - barH - 1, barW, barH, true)}
                      fill={`url(#${gradient}-hatch)`}
                      className="text-[#0b1220]"
                    />
                  )}
                </g>
              );
            })}
            {data.map((d, i) => (
              <g key={d.period}>
                <text
                  className={`lab-axis-x${active === i ? " is-active" : ""}`}
                  x={center(i)}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {d.label}
                  {d.inProgress ? " ·" : ""}
                </text>
                <rect
                  x={pad.left + step * i}
                  y={pad.top}
                  width={step}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={label(points[i])}
                  className="lab-hit"
                  onPointerEnter={() => setHovered(i)}
                  onFocus={() => setFocused(i)}
                  onBlur={() => setFocused(null)}
                />
              </g>
            ))}
          </svg>
        )}
        {active !== null && width > 0 && (
          <Tooltip x={center(active)} width={width}>
            <p className="lab-tooltip__title">
              {data[active].label} {data[active].period.slice(0, 4)}
              {data[active].inProgress ? " · en curso" : ""}
            </p>
            <TooltipRow
              color={seriesColors.expense}
              label="Gastos"
              value={money(points[active].expense, currency)}
            />
          </Tooltip>
        )}
      </div>
      <div className="lab-chart__foot">
        <details className="lab-table-toggle">
          <summary>Ver como tabla</summary>
          <table className="lab-mini-table">
            <caption className="sr-only">
              Gastos mensuales en {currency}
            </caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Gastos</th>
              </tr>
            </thead>
            <tbody>
              {points.map((d) => (
                <tr key={d.period}>
                  <th scope="row">
                    {d.label}
                    {d.inProgress ? " (en curso)" : ""}
                  </th>
                  <td>{money(d.expense, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
