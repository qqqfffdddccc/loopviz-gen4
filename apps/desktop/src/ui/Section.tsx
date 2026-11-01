import { useState, type ReactNode } from "react";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <button type="button" className="section-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        [{open ? "-" : "+"}] {title}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
