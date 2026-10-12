import Link from "next/link";

export function BrandMark() {
  return (
    <Link href="/" className="brand" aria-label="VeilCall homepage">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 38 38" fill="none" role="presentation">
          <path d="M8.5 10.25 18.9 28 29.5 10.25" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square" strokeLinejoin="round" />
          <circle cx="29.5" cy="27.75" r="3" fill="#FB6B4C" />
        </svg>
      </span>
      <span className="brand-wordmark">veil<span>call</span><span className="brand-period">.</span></span>
    </Link>
  );
}
