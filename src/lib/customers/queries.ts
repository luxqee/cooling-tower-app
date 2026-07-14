import { db } from "@/lib/db/client";
import type { Customer } from "@prisma/client";

/** Single customer by id, or null if missing. */
export async function getCustomerById(id: string): Promise<Customer | null> {
  return db.customer.findUnique({ where: { id } });
}
