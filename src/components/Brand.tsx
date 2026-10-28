export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`} aria-label="Nexo Assist">
      <svg viewBox="0 0 28 28" className="brand-mark" aria-hidden="true">
        <path d="M4 23.1V5.5c0-1.5 1.8-2.3 2.9-1.3L21 16.5V5.1c0-1.2.9-2.1 2.1-2.1h.2c1.2 0 2.1.9 2.1 2.1v17.4c0 1.5-1.8 2.3-2.9 1.3L9.2 11.4v11.7c0 1.2-.9 2.1-2.1 2.1h-1C4.9 25.2 4 24.3 4 23.1Z" fill="currentColor" />
      </svg>
      <span>Nexo Assist</span>
    </div>
  );
}
