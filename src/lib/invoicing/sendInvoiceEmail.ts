import { Resend } from "resend";

export interface SendInvoiceEmailOpts {
  to: string;
  from: string;
  invoiceNumber: string;
  jobDescription: string;
  totalAmount: number;
  pdfBuffer: Buffer;
  businessName: string;
}

export async function sendInvoiceEmail(opts: SendInvoiceEmailOpts): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: opts.from,
    to: opts.to,
    subject: `Invoice ${opts.invoiceNumber} — ${opts.jobDescription}`,
    html: `<p>Please find attached invoice <strong>${opts.invoiceNumber}</strong> for <strong>${opts.jobDescription}</strong>.</p><p>Total: <strong>$${opts.totalAmount.toFixed(2)}</strong></p><p>Thanks,<br>${opts.businessName}</p>`,
    attachments: [
      {
        filename: `${opts.invoiceNumber}.pdf`,
        content: opts.pdfBuffer,
      },
    ],
  });
}
