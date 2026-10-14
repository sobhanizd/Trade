import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  if (!host || !process.env.EMAIL_FROM) throw new Error("Email is not configured (SMTP_HOST / EMAIL_FROM missing)");
  transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: ["1", "true", "yes"].includes((process.env.SMTP_SECURE ?? "").toLowerCase()),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(to: string, subject: string, text: string, url?: string | null) {
  if (!to) throw new Error("No email recipient configured in Settings → Notifications");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">${esc(text).replace(/\n/g, "<br>")}${
    url ? `<p><a href="${esc(url)}">Open in CryptoPilot AI</a></p>` : ""
  }</div>`;
  await getTransport().sendMail({ from: process.env.EMAIL_FROM, to, subject: subject.slice(0, 200), text: url ? `${text}\n\n${url}` : text, html });
}

export function resetEmailTransport() {
  transport = null;
}
