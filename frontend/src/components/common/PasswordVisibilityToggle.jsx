export default function PasswordVisibilityToggle({ shown, onToggle, controls, className = "", style }) {
  return (
    <button
      type="button"
      className={`valo-password-toggle${className ? ` ${className}` : ""}`}
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-controls={controls}
      aria-pressed={shown}
      title={shown ? "Hide password" : "Show password"}
      style={style}
    >
      {shown ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 4.2A9.9 9.9 0 0 1 12 4c5.5 0 9 5 9 5s-1 1.5-2.8 2.9" />
          <path d="M6.6 6.6C4.3 8 3 10 3 10s3.5 5 9 5c1.2 0 2.3-.2 3.3-.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )}
    </button>
  );
}
