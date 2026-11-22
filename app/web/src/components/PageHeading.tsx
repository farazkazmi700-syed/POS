import type { ReactNode } from 'react';

/** Shared heading rhythm for all business modules. */
export default function PageHeading({ title, description, eyebrow }: { title: ReactNode; description?: ReactNode; eyebrow?: string }) {
  return <div className="page-heading">
    {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
    <h1 className="page-title">{title}</h1>
    {description && <p className="page-description">{description}</p>}
  </div>;
}
