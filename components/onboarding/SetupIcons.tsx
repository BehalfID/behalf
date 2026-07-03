type IconProps = {
  className?: string;
  size?: number;
};

export function IndividualSetupIcon({ className, size = 40 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 40 40"
      width={size}
    >
      <circle cx="20" cy="13" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 34c0-6.1 4.9-11 11-11s11 4.9 11 11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function TeamSetupIcon({ className, size = 40 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 40 40"
      width={size}
    >
      <circle cx="14" cy="14" r="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="26" cy="14" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 33c0-4.4 3.6-8 8-8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M34 33c0-4.4-3.6-8-8-8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M14 33c0-3.3 2.7-6 6-6s6 2.7 6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
