import { Link } from "react-router-dom";

type Props = {
  size?: "sm" | "md" | "lg";
  subtitle?: string;
};

export default function BrandHeader({ size = "md", subtitle }: Props) {
  return (
    <header className={`brand-header brand-header--${size}`}>
      <Link to="/" className="brand-logo-link" aria-label="geeks — início">
        <img src="/brand/logo.png" alt="geeks — Celular e Game" className="brand-logo" />
      </Link>
      {subtitle ? <p className="brand-subtitle">{subtitle}</p> : null}
    </header>
  );
}
