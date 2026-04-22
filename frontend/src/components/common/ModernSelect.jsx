import { useEffect, useMemo, useRef, useState } from "react";

export default function ModernSelect({
  id,
  name,
  value,
  options,
  onChange,
  placeholder = "Select",
}) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);

  const selectedOption = useMemo(
    () => options.find((option) => !option.divider && option.value === value) || null,
    [options, value],
  );

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (shellRef.current && !shellRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const commitValue = (nextValue) => {
    onChange?.({
      target: {
        name,
        value: nextValue,
      },
    });
    setOpen(false);
  };

  return (
    <div ref={shellRef} className={`modern-select-shell ${open ? "open" : ""}`}>
      <button
        id={id}
        type="button"
        className="modern-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="modern-select-value-wrap">
          {selectedOption ? (
            <span className="modern-select-chip">{selectedOption.label}</span>
          ) : (
            <span className="modern-select-placeholder">{placeholder}</span>
          )}
        </span>
        <span className="modern-select-caret" aria-hidden="true">v</span>
      </button>

      {open ? (
        <div className="modern-select-panel" role="listbox" aria-labelledby={id}>
          {options.map((option, index) => {
            if (option.divider) {
              return (
                <div
                  key={option.id || `divider-${index}`}
                  className="modern-select-divider"
                  role="separator"
                  aria-hidden="true"
                />
              );
            }

            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`modern-select-option ${isSelected ? "selected" : ""}`}
                onClick={() => commitValue(option.value)}
                role="option"
                aria-selected={isSelected}
              >
                <span className="modern-select-option-main">
                  {option.icon ? <span className="modern-select-option-icon" aria-hidden="true">{option.icon}</span> : null}
                  <span className="modern-select-option-copy">
                    <span>{option.label}</span>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
