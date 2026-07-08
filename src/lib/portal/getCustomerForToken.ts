import { db } from "@/lib/db/client";

export async function getCustomerForToken(token: string) {
  const portalToken = await db.customerPortalToken.findUnique({
    where: { token },
    include: { customer: true },
  });

  if (!portalToken) return null;
  if (portalToken.expiresAt < new Date()) return null;

  return portalToken.customer;
}
