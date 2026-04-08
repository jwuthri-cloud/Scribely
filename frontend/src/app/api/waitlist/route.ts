import { NextResponse } from "next/server"
import { Resend } from "resend"

export async function POST(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const { email } = await request.json()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
    }

    await resend.emails.send({
      from: "Scribely <waitlist@scribely.xyz>",
      to: "waitlist@scribely.xyz",
      subject: "New Waitlist Signup",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">New Waitlist Signup 🎉</h2>
          <p style="color: #555;">Someone just joined the Scribely Pro waitlist:</p>
          <p style="font-size: 18px; font-weight: 600; color: #7c3aed;">${email}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">Sent from scribely.xyz waitlist form</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Waitlist signup error:", error)
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 })
  }
}
