/**
 * Line icons for the dashboard shell.
 *
 * The Lovable reference uses `lucide-react`. Adding an icon dependency for one
 * navigation is not worth the bundle, so these are hand-drawn on the same 16px
 * grid with a 1.5 stroke to match the reference's weight and rhythm.
 */
export type ShellIconName =
  | "overview"
  | "agents"
  | "approvals"
  | "attention"
  | "activity"
  | "delegation"
  | "profiles"
  | "webhooks"
  | "billing"
  | "settings"
  | "docs"
  | "support"
  | "bell";

const paths: Record<ShellIconName, React.ReactNode> = {
  overview: (
    <>
      <path d="M8 8.5 10.5 6" />
      <path d="M2.5 12a5.5 5.5 0 1 1 11 0" />
      <circle cx="8" cy="8.5" r=".6" fill="currentColor" stroke="none" />
    </>
  ),
  agents: (
    <>
      <rect x="3" y="5.5" width="10" height="7" rx="2" />
      <path d="M8 3.5v2M5.5 8.5h.01M10.5 8.5h.01M6.5 10.75h3" />
    </>
  ),
  approvals: (
    <>
      <path d="M4.5 2.5h7v11l-3.5-2-3.5 2z" />
      <path d="M6.5 6.5h3" />
    </>
  ),
  attention: (
    <>
      <path d="M8 2.5 14 13H2z" />
      <path d="M8 6.5v3M8 11.5h.01" />
    </>
  ),
  activity: <path d="M1.5 8h3l2-4.5 3 9 2-4.5h3" />,
  delegation: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M2.5 8h11M8 2.5v11" />
    </>
  ),
  profiles: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="m5 7 1.5 1.5L5 10M8.5 10.5h2.5" />
    </>
  ),
  webhooks: (
    <>
      <circle cx="4.5" cy="4.5" r="2" />
      <circle cx="11.5" cy="6.5" r="2" />
      <circle cx="7" cy="12" r="2" />
      <path d="m6.3 5.1 3.3.7M10.2 8.2 8.3 10.4M6.1 10.2 5 6.4" />
    </>
  ),
  billing: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2 6.75h12M4.5 10h2.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M12.4 3.6l-1.05 1.05M4.65 11.35 3.6 12.4" />
    </>
  ),
  docs: (
    <>
      <path d="M4 2.5h5l3 3v8H4z" />
      <path d="M9 2.5v3h3M6 8.5h4M6 11h4" />
    </>
  ),
  support: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 11.5h.01M6.5 6.4a1.5 1.5 0 1 1 1.9 1.85c-.35.15-.4.4-.4.75" />
    </>
  ),
  bell: (
    <>
      <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4z" />
      <path d="M6.5 13a1.75 1.75 0 0 0 3 0" />
    </>
  )
};

export function ShellNavIcon({ name }: { name: ShellIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="shell-nav__icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      {paths[name]}
    </svg>
  );
}
