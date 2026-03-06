import { NextResponse } from "next/server"

// Placeholder API route. Integrate with Resend, SendGrid, Formspree, etc.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, subject, message } = body

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // TODO: Add your email service integration here
    // Example with Resend:
    // const res = await fetch("https://api.resend.com/emails", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    //   body: JSON.stringify({ from: "contact@scribely.app", to: "hello@scribely.xyz", subject, html: `<p>From: ${name} &lt;${email}&gt;</p><p>${message}</p>` }),
    // })

    // For now, log and return success (form will fall back to mailto if this fails)
    console.log("Contact form submission:", { name, email, subject, message })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Contact form error:", error)
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    )
  }
}
