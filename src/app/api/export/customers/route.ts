import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { toCsv, csvResponse } from "@/lib/export/csv";

export async function GET() {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const customers = await db.customer.findMany({ orderBy: { name: "asc" } });

  const csv = toCsv(
    ["Name", "ABN", "Contact Person", "Email", "Phone", "Address", "Notes", "Created"],
    customers.map((c) => [c.name, c.abn, c.contactPerson, c.email, c.phone, c.address, c.notes, c.createdAt]),
  );

  return csvResponse("customers.csv", csv);
}
