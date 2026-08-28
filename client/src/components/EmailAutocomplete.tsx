import { useMemo, useRef, useState } from "react";

export interface Contact {
  name: string;
  email: string;
}

// A comma-separated email input that suggests addresses the Hub has seen
// before (GET /api/contacts) as you type the current recipient. Anyone
// previously on a ticket's To/Cc, plus all Hub users.
export function EmailAutocomplete({
  value,
  onChange,
  contacts,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  contacts: Contact[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // The address currently being typed = text after the last comma.
  const tokens = value.split(",");
  const currentRaw = tokens[tokens.length - 1] ?? "";
  const current = currentRaw.trim().toLowerCase();
  const already = new Set(
    tokens
      .slice(0, -1)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  );

  const suggestions = useMemo(() => {
    if (current.length < 2) return [];
    return contacts
      .filter(
        (c) =>
          !already.has(c.email) &&
          (c.email.includes(current) || c.name.toLowerCase().includes(current))
      )
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, current, value]);

  function choose(c: Contact) {
    const head = tokens
      .slice(0, -1)
      .map((t) => t.trim())
      .filter(Boolean);
    onChange([...head, c.email].join(", ") + ", ");
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            choose(suggestions[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {suggestions.map((c, i) => (
            <li key={c.email}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                className={`flex w-full flex-col items-start px-3 py-1.5 text-left ${
                  i === active ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                {c.name && <span className="text-slate-700">{c.name}</span>}
                <span className="text-xs text-slate-500">{c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
