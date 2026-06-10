/** kubectl-style age: 12s, 4m, 3h, 12d, 2y. */
export function formatAge(creationTimestamp?: string): string {
  if (!creationTimestamp) return "—";
  const created = new Date(creationTimestamp).getTime();
  if (Number.isNaN(created)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}
