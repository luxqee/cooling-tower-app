import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect, notFound } from "next/navigation";
import { CustomerDetail } from "./CustomerDetail";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) redirect("/");

  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: {
      jobs: {
        select: {
          id: true, customerName: true, siteName: true,
          status: true, createdAt: true, jobType: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) notFound();

  const [assets, contracts] = await Promise.all([
    db.asset.findMany({ where: { customerId: params.id }, orderBy: { serialNumber: "asc" } }),
    db.contract.findMany({ where: { customerId: params.id }, orderBy: { renewalDate: "asc" } }),
  ]);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <CustomerDetail
          customer={{
            id:            customer.id,
            name:          customer.name,
            abn:           customer.abn,
            contactPerson: customer.contactPerson,
            email:         customer.email,
            phone:         customer.phone,
            address:       customer.address,
            notes:         customer.notes,
          }}
          jobs={customer.jobs.map((j) => ({
            id:           j.id,
            customerName: j.customerName,
            siteName:     j.siteName,
            status:       j.status as "scheduled" | "active" | "complete" | "cancelled",
            createdAt:    j.createdAt.toISOString(),
            jobType:      j.jobType,
          }))}
          assets={assets.map((a) => ({
            id:           a.id,
            serialNumber: a.serialNumber,
            assetType:    a.assetType,
            location:     a.location,
          }))}
          contracts={contracts.map((c) => ({
            id:             c.id,
            siteName:       c.siteName,
            value:          c.value.toNumber(),
            billingCadence: c.billingCadence,
            renewalDate:    c.renewalDate.toISOString(),
            status:         c.status,
          }))}
          canEdit={user.role === "admin"}
          canManageAssets={["admin", "director"].includes(user.role)}
        />
      </div>
    </AppShell>
  );
}
