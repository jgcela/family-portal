/** A round avatar: the person's photo, or their initials. */
export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export function Avatar({ name, image, size = 36, className = '' }: { name: string; image?: string | null; size?: number; className?: string }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" width={size} height={size} className={`acct-avatar ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span className={`acct-avatar acct-avatar-initials ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
