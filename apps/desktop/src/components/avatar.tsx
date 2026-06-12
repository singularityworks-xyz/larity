import { cx } from "../lib/ui";

const WHITESPACE_REGEX = /\s+/;

export function getInitials(name: string) {
  const parts = name.trim().split(WHITESPACE_REGEX);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function InitialsAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex select-none items-center justify-center overflow-hidden rounded-full border border-border bg-bg-emphasis font-medium text-fg shadow-sm",
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
