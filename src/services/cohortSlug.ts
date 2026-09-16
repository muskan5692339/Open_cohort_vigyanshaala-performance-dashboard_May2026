/** Stable URL slug for a cohort name, e.g. "Incubator 14.0" → "incubator-14-0". */
export function slugifyCohortName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'cohort';
}

export function studentViewPathForSlug(slug: string): string {
  return `/student-view/${slug}`;
}

export function cohortSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/student-view\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

export function cohortSlugFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return cohortSlugFromPath(window.location.pathname);
}

export function cohortStoragePath(orgId: string, slug: string): string {
  return `${orgId}/cohorts/${slug}/latest.json.gz`;
}
