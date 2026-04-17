export default function SegmentedPillSelect({
  id,
  name,
  value,
  options,
  onChange,
}) {
  return (
    <div id={id} className="segmented-pill-group" role="group" aria-label={name}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`segmented-pill ${isSelected ? "selected" : ""}`}
            onClick={() =>
              onChange?.({
                target: {
                  name,
                  value: option.value,
                },
              })
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
