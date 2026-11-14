"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LabIcon } from "./icons";
import { setLabPaused, useLabMotion } from "./motion";
import { paletteKeys, palettes, setPalette, usePalette } from "./palettes";
import {
  footerItems,
  navGroups,
  navHref,
  type LabNavItem,
  type LabView,
} from "./nav";

export type LabVariant = "final";

/** Barra del laboratorio: identifica el prototipo y permite comparar paletas. */
export function LabBar() {
  const { paused, reduced } = useLabMotion();
  const palette = usePalette();
  return (
    <div className="lab-bar">
      <p className="lab-bar__tag">
        <span className="lab-bar__pulse" aria-hidden="true" />
        <span className="hidden sm:inline">Prototipo UI-01 ·</span> Datos
        ficticios
      </p>
      <div
        role="group"
        aria-label="Paleta de colores"
        className="lab-bar__switch"
      >
        {paletteKeys.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === palette}
            title={palettes[key].description}
            className="lab-bar__option"
            onClick={() => setPalette(key)}
          >
            <span className="lab-bar__swatch" aria-hidden="true">
              {palettes[key].swatch.slice(1).map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </span>
            <span className="hidden md:inline">{palettes[key].name}</span>
            <span className="sr-only md:hidden">{palettes[key].name}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="lab-bar__icon"
          disabled={reduced}
          title={reduced ? "Movimiento reducido por el sistema" : undefined}
          onClick={() => setLabPaused(!paused)}
        >
          <LabIcon
            name={paused || reduced ? "play" : "pause"}
            duotone={false}
            className="size-4"
          />
          <span className="sr-only md:not-sr-only">
            {reduced
              ? "Movimiento reducido"
              : paused
                ? "Reanudar fondo"
                : "Pausar fondo"}
          </span>
        </button>
      </div>
    </div>
  );
}

function NavItem({
  item,
  variant,
  view,
  onNavigate,
  compact,
}: {
  item: LabNavItem;
  variant: LabVariant;
  view: LabView;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const href = navHref(variant, item);
  const current = item.view === view;
  const content = (
    <>
      <span
        className="lab-nav__icon"
        style={{ "--hue": item.hue } as React.CSSProperties}
      >
        <LabIcon name={item.icon} />
      </span>
      <span className="lab-nav__label">{item.label}</span>
      {item.badge && (
        <span
          className="lab-nav__badge"
          aria-label={`${item.badge} pendientes`}
        >
          {item.badge}
        </span>
      )}
    </>
  );
  if (!href)
    return (
      <span
        className="lab-nav__item is-inert"
        data-nav={item.key}
        aria-disabled="true"
        title="Fuera del alcance del prototipo"
      >
        {content}
      </span>
    );
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="lab-nav__item"
      data-nav={item.key}
      onClick={onNavigate}
      aria-label={compact ? item.label : undefined}
    >
      {content}
    </Link>
  );
}

export function LabNav({
  variant,
  view,
  onNavigate,
  compact,
}: {
  variant: LabVariant;
  view: LabView;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <nav aria-label="Navegación principal" className="lab-nav">
      {navGroups.map((group) => (
        <div key={group.title} className="lab-nav__group">
          <p className="lab-nav__heading">{group.title}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.key}>
                <NavItem
                  item={item}
                  variant={variant}
                  view={view}
                  onNavigate={onNavigate}
                  compact={compact}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ul className="lab-nav__footer">
        {footerItems.map((item) => (
          <li key={item.key}>
            <NavItem
              item={item}
              variant={variant}
              view={view}
              onNavigate={onNavigate}
              compact={compact}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Brand({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <p className="lab-brand">
      <span className="lab-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-5">
          <path
            d="M5 16.5c3-5.5 6-8.5 14-11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="5.5" cy="17" r="2.2" fill="currentColor" />
          <circle cx="18.5" cy="6" r="1.6" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="lab-brand__name">Finanzas</span>
        {subtitle && <span className="lab-brand__sub">personales</span>}
      </span>
    </p>
  );
}

/** Navegación móvil en <dialog> modal: foco atrapado y Escape nativos. */
export function MobileDrawer({
  variant,
  view,
  trigger,
}: {
  variant: LabVariant;
  view: LabView;
  trigger?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => dialog.current?.close();

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onChange = () => desktop.matches && dialog.current?.close();
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button
        type="button"
        className="lab-icon-btn"
        aria-label="Abrir navegación"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        {trigger ?? <LabIcon name="menu" duotone={false} />}
      </button>
      <dialog
        ref={dialog}
        aria-label="Navegación"
        className="lab-drawer"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="lab-drawer__inner">
          <div className="flex items-center justify-between gap-3">
            <Brand />
            <button
              type="button"
              className="lab-icon-btn"
              aria-label="Cerrar navegación"
              onClick={close}
            >
              <LabIcon name="close" duotone={false} />
            </button>
          </div>
          <LabNav variant={variant} view={view} onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}

/** Selector de moneda de visualización (ya existe en el producto). */
export function CurrencySegment({ className = "" }: { className?: string }) {
  const [value, setValue] = useState("UYU");
  return (
    <div
      role="group"
      aria-label="Moneda de visualización"
      className={`lab-segment ${className}`}
    >
      {["UYU", "USD", "EUR"].map((currency) => (
        <button
          key={currency}
          type="button"
          aria-pressed={value === currency}
          className="lab-segment__option"
          onClick={() => setValue(currency)}
        >
          {currency}
        </button>
      ))}
    </div>
  );
}

export function MonthStepper() {
  return (
    <div className="lab-stepper" role="group" aria-label="Mes del reporte">
      <button
        type="button"
        className="lab-stepper__btn"
        aria-label="Mes anterior"
      >
        <LabIcon name="chevronLeft" duotone={false} className="size-4" />
      </button>
      <span className="lab-stepper__label">
        <LabIcon name="calendar" className="size-4" />
        Noviembre 2026
      </span>
      <button
        type="button"
        className="lab-stepper__btn"
        aria-label="Mes siguiente"
        disabled
      >
        <LabIcon name="chevronRight" duotone={false} className="size-4" />
      </button>
    </div>
  );
}
