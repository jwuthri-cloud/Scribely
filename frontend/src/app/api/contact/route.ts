import { NextResponse } from "next/server"
import { Resend } from "resend"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("Contact form: RESEND_API_KEY is not set")
    return NextResponse.json({ error: "Email is not configured" }, { status: 503 })
  }

  const resend = new Resend(apiKey)
  const to = process.env.CONTACT_INBOX_EMAIL ?? "hello@scribely.xyz"

  try {
    const body = await request.json()
    const { name, email, subject, message } = body

    if (
      !name ||
      !email ||
      !subject ||
      !message ||
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof subject !== "string" ||
      typeof message !== "string"
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    const safe = {
      name: escapeHtml(name.trim()),
      email: escapeHtml(email.trim()),
      subject: escapeHtml(subject.trim()),
      message: escapeHtml(message.trim()).replace(/\n/g, "<br/>"),
    }

    await resend.emails.send({
      from: "Scribely <contact@scribely.xyz>",
      to,
      replyTo: email.trim(),
      subject: `[Contact] ${subject.trim()}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">New contact form message</h2>
          <p style="color: #555;"><strong>From:</strong> ${safe.name} &lt;${safe.email}&gt;</p>
          <p style="color: #333;"><strong>Subject:</strong> ${safe.subject}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <div style="color: #333; line-height: 1.5;">${safe.message}</div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">Sent from scribely.xyz contact form</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Contact form error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
