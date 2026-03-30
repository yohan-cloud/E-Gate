import { useEffect, useMemo, useRef, useState } from "react";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return "";
  return `${day}-${month}-${year}`;
}

function formatDateTime(value) {
  if (!value || !value.includes("T")) return "";
  const [date, time] = value.split("T");
  const [rawHour = "00", minute = "00"] = time.split(":");
  const hour24 = Number(rawHour);
  if (Number.isNaN(hour24)) return formatDate(date);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${formatDate(date)} ${pad(hour12)}:${minute} ${period}`;
}

function parseDateTime(value) {
  if (!value || !value.includes("T")) {
    return { date: "", hour: "09", minute: "00", period: "AM" };
  }
  const [datePart, timePart] = value.split("T");
  const [rawHour = "00", rawMinute = "00"] = timePart.split(":");
  const hour24 = Number(rawHour);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    date: datePart,
    hour: pad(hour12),
    minute: pad(rawMinute),
    period,
  };
}

function composeDateTime({ date, hour, minute, period }) {
  if (!date) return "";
  const hourNum = Number(hour || "09");
  let hour24 = hourNum % 12;
  if (period === "PM") hour24 += 12;
  return `${date}T${pad(hour24)}:${pad(minute || "00")}`;
}

function toMonthKey(date) {
  const parsed = date ? new Date(`${date}T00:00:00`) : new Date();
  return { month: parsed.getMonth(), year: parsed.getFullYear() };
}

function buildCalendarDays(month, year) {
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${pad(month + 1)}-${pad(day)}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(view, delta) {
  const date = new Date(view.year, view.month + delta, 1);
  return { month: date.getMonth(), year: date.getFullYear() };
}

function buildYearOptions() {
  const startYear = 1900;
  const endYear = 2100;
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function PickerShell({ id, label, value, displayValue, open, setOpen, children, helpText, required, panelInFlow = false }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  return (
    <div className={`form-group picker-field ${panelInFlow ? "picker-field-flow" : ""}`} ref={rootRef}>
      {label ? <label htmlFor={`${id}-trigger`}>{label}</label> : null}
      <button
        id={`${id}-trigger`}
        type="button"
        className={`picker-trigger ${value ? "" : "placeholder"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="picker-trigger-text">{displayValue}</span>
        <span className="picker-trigger-icon">v</span>
      </button>
      {open ? children : null}
      {required ? <input type="hidden" value={value || ""} required readOnly /> : null}
      {helpText ? <small>{helpText}</small> : null}
    </div>
  );
}

export function DateField({ id, label, name, value, onChange, required = false, helpText = "", placeholder = "Select date", panelInFlow = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [view, setView] = useState(() => toMonthKey(value));

  useEffect(() => {
    setDraft(value || "");
    setView(toMonthKey(value));
  }, [value]);

  const days = useMemo(() => buildCalendarDays(view.month, view.year), [view]);
  const yearOptions = useMemo(() => buildYearOptions(view.year), [view.year]);

  return (
    <PickerShell
      id={id}
      label={label}
      value={value}
      displayValue={value ? formatDate(value) : placeholder}
      open={open}
      setOpen={setOpen}
      helpText={helpText}
      required={required}
      panelInFlow={panelInFlow}
    >
      <div className="picker-panel">
        <div className="picker-calendar-header">
          <button type="button" onClick={() => setView((current) => shiftMonth(current, -1))}>{"<"}</button>
          <div className="picker-calendar-selects">
            <select value={view.month} onChange={(e) => setView((current) => ({ ...current, month: Number(e.target.value) }))}>
              {MONTH_LABELS.map((monthLabel, index) => (
                <option key={monthLabel} value={index}>
                  {monthLabel}
                </option>
              ))}
            </select>
            <select value={view.year} onChange={(e) => setView((current) => ({ ...current, year: Number(e.target.value) }))}>
              {yearOptions.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setView((current) => shiftMonth(current, 1))}>{">"}</button>
        </div>
        <div className="picker-weekdays">
          {WEEKDAY_LABELS.map((labelText) => <span key={labelText}>{labelText}</span>)}
        </div>
        <div className="picker-days">
          {days.map((dayValue, index) => (
            <button
              key={dayValue || `blank-${index}`}
              type="button"
              className={`picker-day ${dayValue === draft ? "selected" : ""} ${!dayValue ? "empty" : ""}`}
              onClick={() => dayValue && setDraft(dayValue)}
              disabled={!dayValue}
            >
              {dayValue ? Number(dayValue.slice(-2)) : ""}
            </button>
          ))}
        </div>
        <div className="picker-actions">
          <button type="button" onClick={() => { setDraft(value || ""); setOpen(false); }}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onChange?.({ target: { name, value: draft } });
              setOpen(false);
            }}
          >
            Done
          </button>
        </div>
      </div>
    </PickerShell>
  );
}

export function DateTimeField({ id, label, name, value, onChange, required = false, helpText = "", placeholder = "Select date and time", panelInFlow = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(parseDateTime(value));
  const [view, setView] = useState(() => toMonthKey(parseDateTime(value).date));

  useEffect(() => {
    const parsed = parseDateTime(value);
    setDraft(parsed);
    setView(toMonthKey(parsed.date));
  }, [value]);

  const days = useMemo(() => buildCalendarDays(view.month, view.year), [view]);
  const yearOptions = useMemo(() => buildYearOptions(view.year), [view.year]);

  return (
    <PickerShell
      id={id}
      label={label}
      value={value}
      displayValue={value ? formatDateTime(value) : placeholder}
      open={open}
      setOpen={setOpen}
      helpText={helpText}
      required={required}
      panelInFlow={panelInFlow}
    >
      <div className="picker-panel picker-panel-datetime">
        <div className="picker-calendar-block">
          <div className="picker-calendar-header">
            <button type="button" onClick={() => setView((current) => shiftMonth(current, -1))}>{"<"}</button>
            <div className="picker-calendar-selects">
              <select value={view.month} onChange={(e) => setView((current) => ({ ...current, month: Number(e.target.value) }))}>
                {MONTH_LABELS.map((monthLabel, index) => (
                  <option key={monthLabel} value={index}>
                    {monthLabel}
                  </option>
                ))}
              </select>
              <select value={view.year} onChange={(e) => setView((current) => ({ ...current, year: Number(e.target.value) }))}>
                {yearOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setView((current) => shiftMonth(current, 1))}>{">"}</button>
          </div>
          <div className="picker-weekdays">
            {WEEKDAY_LABELS.map((labelText) => <span key={labelText}>{labelText}</span>)}
          </div>
          <div className="picker-days">
            {days.map((dayValue, index) => (
              <button
                key={dayValue || `blank-${index}`}
                type="button"
                className={`picker-day ${dayValue === draft.date ? "selected" : ""} ${!dayValue ? "empty" : ""}`}
                onClick={() => dayValue && setDraft({ ...draft, date: dayValue })}
                disabled={!dayValue}
              >
                {dayValue ? Number(dayValue.slice(-2)) : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="picker-time-block">
          <div className="picker-time-title">Select Time</div>
          <div className="time-entry simple">
            <select value={draft.hour} onChange={(e) => setDraft({ ...draft, hour: e.target.value })}>
              {HOUR_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={draft.minute} onChange={(e) => setDraft({ ...draft, minute: e.target.value })}>
              {MINUTE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div className="picker-time-preview">
            {draft.date ? formatDateTime(composeDateTime(draft)) : "Choose a date and time"}
          </div>
          <div className="picker-actions">
            <button type="button" onClick={() => { const parsed = parseDateTime(value); setDraft(parsed); setOpen(false); }}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onChange?.({ target: { name, value: composeDateTime(draft) } });
                setOpen(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </PickerShell>
  );
}
