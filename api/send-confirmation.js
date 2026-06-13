// ═══════════════════════════════════════
// POST /api/send-confirmation
// Sends a WhatsApp confirmation (with SMS fallback) via Twilio
// after a new appointment is booked.
// ═══════════════════════════════════════

import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase with service-level access (server-side only)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Initialize Twilio client — credentials must never reach the frontend
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Format a date into a human-readable string for message bodies
function formatDateTime(isoString) {
  const date = new Date(isoString);
  const options = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  };
  const formattedDate = date.toLocaleDateString("en-US", options);
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  return { formattedDate, formattedTime };
}

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { appointmentId, customerName, phoneNumber, appointmentAt } = req.body;

    // Validate that all required fields are present
    if (!appointmentId || !customerName || !phoneNumber || !appointmentAt) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: appointmentId, customerName, phoneNumber, appointmentAt",
      });
    }

    const { formattedDate, formattedTime } = formatDateTime(appointmentAt);

    // Compose the confirmation message body
    const messageBody = `Hi ${customerName}! ✅ Your appointment is confirmed for ${formattedDate} at ${formattedTime}. Reply STOP to unsubscribe.`;

    let messageSid = null;
    let channel = null;

    // Attempt WhatsApp delivery first — this is the preferred channel
    try {
      const whatsappMsg = await twilioClient.messages.create({
        body: messageBody,
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${phoneNumber}`,
      });

      messageSid = whatsappMsg.sid;
      channel = "whatsapp";
      console.log(
        `[SEND-CONFIRMATION] WhatsApp sent | SID: ${messageSid} | To: ${phoneNumber} | Time: ${new Date().toISOString()}`
      );
    } catch (whatsappError) {
      // WhatsApp failed (e.g. number not in sandbox) — fall back to SMS
      console.log(
        `[SEND-CONFIRMATION] WhatsApp failed for ${phoneNumber}: ${whatsappError.message}. Falling back to SMS.`
      );

      try {
        const smsMsg = await twilioClient.messages.create({
          body: messageBody,
          from: process.env.TWILIO_SMS_FROM,
          to: phoneNumber,
        });

        messageSid = smsMsg.sid;
        channel = "sms";
        console.log(
          `[SEND-CONFIRMATION] SMS sent | SID: ${messageSid} | To: ${phoneNumber} | Time: ${new Date().toISOString()}`
        );
      } catch (smsError) {
        // Both channels failed — report the error upstream
        console.error(
          `[SEND-CONFIRMATION] Both WhatsApp and SMS failed for ${phoneNumber}: ${smsError.message}`
        );
        return res.status(500).json({
          success: false,
          error: `Both WhatsApp and SMS delivery failed. WhatsApp: ${whatsappError.message}. SMS: ${smsError.message}`,
        });
      }
    }

    // Message delivered — update the appointment status to 'confirmed'
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", appointmentId);

    if (updateError) {
      console.error(
        `[SEND-CONFIRMATION] Supabase update failed for ${appointmentId}: ${updateError.message}`
      );
      // Message was sent successfully even if DB update failed — still report success
    }

    return res.status(200).json({
      success: true,
      channel,
      messageSid,
    });
  } catch (error) {
    console.error(`[SEND-CONFIRMATION] Unexpected error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
