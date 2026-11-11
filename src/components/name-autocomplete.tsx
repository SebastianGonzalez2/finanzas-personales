"use client";

import { useEffect, useId, useRef, useState } from "react";

type Suggestion = { id: string; name: string };

// Autocompletado de comercios y contactos sobre POST/GET /api/catalog.
// El texto libre siempre es válido: la app sugiere, no obliga, y el guardado
// del formulario no depende de las sugerencias (best-effort).
export function NameAutocomplete({
  kind,
  name,
  label,
  required,
  maxLength = 100,
  className,
}: {
  kind: "merchant" | "person";
  name: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  className: string;
}) {
  const listId = useId();
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurOpen = useRef(false);

  useEffect(() => {
    const query = value.trim();
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/catalog?kind=${kind}&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data: { entries?: Suggestion[] } = await response.json();
        if (controller.signal.aborted) return;
        const found = data.entries ?? [];
        setSuggestions(found);
        setOpen(found.length > 0 && !blurOpen.current);
        setActive(-1);
      } catch {
        // Sin sugerencias el formulario sigue funcionando con texto libre.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, value]);

  function apply(suggestion: Suggestion) {
    setValue(suggestion.name);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && open) {
      event.preventDefault();
      setActive(Math.min(active + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setActive(Math.max(active - 1, -1));
    } else if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault();
      apply(suggestions[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative grid min-w-0 gap-1 text-sm font-medium">
      <label className="grid min-w-0 gap-1 text-sm font-medium">
        {label}
        <input
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            if (!next.trim()) {
              setSuggestions([]);
              setOpen(false);
              setActive(-1);
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            blurOpen.current = true;
            setOpen(false);
          }}
          onFocus={() => {
            blurOpen.current = false;
            if (suggestions.length) setOpen(true);
          }}
          name={name}
          required={required}
          maxLength={maxLength}
          className={className}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
        />
      </label>
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Coincidencias de ${label}`}
          className="absolute top-full z-10 max-h-64 w-full overflow-auto rounded-lg border bg-background py-1 shadow"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              role="option"
              aria-selected={index === active}
            >
              <button
                type="button"
                className={`block w-full min-h-9 px-3 text-left text-sm hover:bg-accent ${
                  index === active ? "bg-accent" : ""
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => apply(suggestion)}
              >
                {suggestion.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
