import { useEffect, useRef, useState } from "react";

// A small contentEditable rich-text editor for composing Hub replies, with
// the formatting controls Gmail's compose box has: font, size, bold/italic/
// underline, colour, alignment, lists, indent, quote, strikethrough, clear.
// Emits sanitised-on-the-server HTML; execCommand is deprecated but is the
// pragmatic choice here (universally supported, exactly this feature set).

const FONTS = ["Arial", "Verdana", "Georgia", "Tahoma", "Times New Roman", "Courier New"];
const SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "6" },
];

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // onMouseDown (not onClick) so the editor keeps its selection/focus
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm text-slate-600 hover:bg-slate-200"
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);

  // Only push the DOM from `value` when it's been externally cleared (after a
  // successful post) — syncing on every keystroke would fight the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && value === "" && el.innerHTML !== "") {
      el.innerHTML = "";
      setEmpty(true);
    }
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const isEmpty = el.textContent?.trim() === "" && !el.querySelector("img,table,hr");
    setEmpty(isEmpty);
    onChange(isEmpty ? "" : el.innerHTML);
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* not all browsers support this arg — harmless */
    }
    document.execCommand(command, false, arg);
    emit();
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1 py-1">
        <select
          aria-label="Font"
          onChange={(e) => exec("fontName", e.target.value)}
          className="h-7 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600"
          defaultValue=""
        >
          <option value="" disabled>
            Font
          </option>
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <select
          aria-label="Text size"
          onChange={(e) => exec("fontSize", e.target.value)}
          className="h-7 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600"
          defaultValue=""
        >
          <option value="" disabled>
            Size
          </option>
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton title="Bold" onClick={() => exec("bold")}>
          <b>B</b>
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => exec("italic")}>
          <i>I</i>
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => exec("underline")}>
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" onClick={() => exec("strikeThrough")}>
          <s>S</s>
        </ToolbarButton>
        <label
          title="Text colour"
          className="flex h-7 cursor-pointer items-center rounded px-1 text-sm text-slate-600 hover:bg-slate-200"
          onMouseDown={(e) => e.stopPropagation()}
        >
          A
          <input
            type="color"
            className="ml-0.5 h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            onChange={(e) => exec("foreColor", e.target.value)}
          />
        </label>

        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton title="Align left" onClick={() => exec("justifyLeft")}>
          ⯇
        </ToolbarButton>
        <ToolbarButton title="Align centre" onClick={() => exec("justifyCenter")}>
          ≡
        </ToolbarButton>
        <ToolbarButton title="Align right" onClick={() => exec("justifyRight")}>
          ⯈
        </ToolbarButton>
        <ToolbarButton title="Bulleted list" onClick={() => exec("insertUnorderedList")}>
          •
        </ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => exec("insertOrderedList")}>
          1.
        </ToolbarButton>
        <ToolbarButton title="Decrease indent" onClick={() => exec("outdent")}>
          ⇤
        </ToolbarButton>
        <ToolbarButton title="Increase indent" onClick={() => exec("indent")}>
          ⇥
        </ToolbarButton>
        <ToolbarButton title="Quote" onClick={() => exec("formatBlock", "blockquote")}>
          ❝
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolbarButton title="Clear formatting" onClick={() => exec("removeFormat")}>
          ⨯
        </ToolbarButton>
      </div>

      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || "Reply"}
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        data-empty={empty ? "true" : "false"}
        className="hub-rich-text hub-editor min-h-[140px] max-h-[420px] overflow-y-auto px-3 py-2 outline-none"
      />
    </div>
  );
}
