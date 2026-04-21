import { useEffect, useMemo, useState } from "react";
import { AUDIENCE_LABELS, AUDIENCE_OPTIONS, parseAudienceValue, stringifyAudienceValue } from "./audienceOptions";

function AudienceSection({ title, options, draftSelection, onToggleAudience }) {
  return (
    <section className="audience-modal-section">
      <div className="audience-modal-section-title">{title}</div>
      <div className="audience-modal-option-grid">
        {options.map((option) => {
          const isSelected = draftSelection.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`audience-modal-option ${isSelected ? "selected" : ""}`}
              onClick={() => onToggleAudience(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function AudienceSelector({ id, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftSelection, setDraftSelection] = useState(() => parseAudienceValue(value));

  const selectedAudiences = useMemo(() => parseAudienceValue(value), [value]);
  const selectedAudienceLabels = selectedAudiences.map((item) => AUDIENCE_LABELS[item] || item);
  const triggerLabel = selectedAudiences.includes("all") ? "Select Audience" : "Set Custom Audience";

  useEffect(() => {
    setDraftSelection(parseAudienceValue(value));
  }, [value]);

  const openModal = () => {
    setDraftSelection(parseAudienceValue(value));
    setIsOpen(true);
  };

  const closeModal = () => {
    setDraftSelection(parseAudienceValue(value));
    setIsOpen(false);
  };

  const toggleAudience = (audienceValue) => {
    setDraftSelection((current) => {
      if (audienceValue === "all") {
        return ["all"];
      }

      const withoutAll = current.filter((item) => item !== "all");
      if (withoutAll.includes(audienceValue)) {
        const next = withoutAll.filter((item) => item !== audienceValue);
        return next.length ? next : [];
      }
      return [...withoutAll, audienceValue];
    });
  };

  const chooseCustomSelection = () => {
    setDraftSelection((current) => current.filter((item) => item !== "all"));
  };

  const applyAudience = () => {
    onChange(stringifyAudienceValue(draftSelection));
    setIsOpen(false);
  };

  return (
    <div className="audience-selector-shell">
      <button
        id={id}
        type="button"
        className="audience-selector-trigger"
        onClick={openModal}
      >
        <span>{triggerLabel}</span>
        <span className="audience-selector-trigger-meta">
          {selectedAudiences.includes("all") ? "All Audience" : `${selectedAudiences.length} selected`}
        </span>
      </button>

      <div className="audience-selector-summary">
        {selectedAudienceLabels.map((label) => (
          <span key={label} className="audience-selector-pill">
            {label}
          </span>
        ))}
      </div>

      {isOpen ? (
        <div
          className="audience-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
          onClick={closeModal}
        >
          <div className="audience-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="audience-modal-head">
              <div>
                <div className="audience-modal-eyebrow">Event Audience</div>
                <h3 id={`${id}-title`} className="audience-modal-title">Select Audience</h3>
                <p className="audience-modal-copy">
                  Group the event audience by age, status, or voter status. Choosing All Audience resets the custom filters.
                </p>
              </div>
              <button type="button" className="audience-modal-close" onClick={closeModal} aria-label="Close audience selector">
                X
              </button>
            </div>

            <AudienceSection
              title="Audience Type"
              options={[
                { value: "all", label: "All Audience" },
                { value: "__custom__", label: "Custom Selection" },
              ]}
              draftSelection={draftSelection.includes("all") ? ["all"] : ["__custom__"]}
              onToggleAudience={(optionValue) => {
                if (optionValue === "all") {
                  setDraftSelection(["all"]);
                  return;
                }
                chooseCustomSelection();
              }}
            />

            <AudienceSection
              title="Age Group"
              options={AUDIENCE_OPTIONS.filter((option) => option.group === "Age Group")}
              draftSelection={draftSelection}
              onToggleAudience={toggleAudience}
            />

            <AudienceSection
              title="Status"
              options={AUDIENCE_OPTIONS.filter((option) => option.group === "Status")}
              draftSelection={draftSelection}
              onToggleAudience={toggleAudience}
            />

            <AudienceSection
              title="Voter Status"
              options={AUDIENCE_OPTIONS.filter((option) => option.group === "Voter Status")}
              draftSelection={draftSelection}
              onToggleAudience={toggleAudience}
            />

            <div className="audience-modal-actions">
              <button type="button" className="audience-modal-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className="audience-modal-primary" onClick={applyAudience}>
                Apply Audience
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
