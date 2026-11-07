type OwnedResource = Readonly<{ ownerId: string }>;

/**
 * Pure policy ONLY. verifiedOwnerId must come from a fresh, admitted server
 * session, never from request JSON/headers. No Neon/session adapter exists here.
 * DB queries must also scope by owner and validate relations transactionally.
 */
export function requireOwnedResources(
  verifiedOwnerId: unknown,
  resources: readonly (OwnedResource | null | undefined)[],
): string {
  if (typeof verifiedOwnerId !== "string" || verifiedOwnerId.length === 0 || verifiedOwnerId.trim() !== verifiedOwnerId) {
    throw new Error("Acceso denegado");
  }
  for (const resource of resources) {
    if (!resource || resource.ownerId !== verifiedOwnerId) throw new Error("Acceso denegado");
  }
  return verifiedOwnerId;
}
