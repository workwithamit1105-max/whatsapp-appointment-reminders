// ═══════════════════════════════════════
// GET /api/send-reminders
// Cron-triggered endpoint that sends 1-hour reminders for upcoming appointments.
//
// NOTE: Vercel Cron requires a Pro plan. If you are on the Hobby plan,
// call this endpoint externally using a free cron service like cron-job.org
// with the schedule: every 1 minute → GET https://your-app.vercel.app/api/send-reminders
// ═══════════════════════════════════════

import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Format time for the reminder message body
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function handler(req, res) {
  // Accept both GET (cron) and POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const now = new Date().toISOString();
    // Find any appointments that haven't been reminded yet (no time constraint for demo)
    const { data: appointments, error: fetchError } = await supabase
      .from("appointments")
      .select("*")
      .eq("reminder_sent", false)
      .not("status", "in", '("cancelled","completed")');

    if (fetchError) {
      console.error(
        `[SEND-REMINDERS] Supabase query failed: ${fetchError.message}`
      );
      return res.status(500).json({
        success: false,
        error: fetchError.message,
      });
    }

    if (!appointments || appointments.length === 0) {
      console.log("[SEND-REMINDERS] No upcoming appointments to remind.");
      return res.status(200).json({ reminderssent: 0 });
    }

    let remindersSent = 0;

    // Process each appointment that needs a reminder
    for (const appt of appointments) {
      const formattedTime = formatTime(appt.appointment_at);
      const messageBody = `Hi ${appt.customer_name}! ⏰ Reminder: your appointment is in 2 minutes (${formattedTime}). See you soon!`;

      let sent = false;

      // Try WhatsApp first, fall back to SMS on failure
      try {
        const whatsappMsg = await twilioClient.messages.create({
          body: messageBody,
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: `whatsapp:${appt.phone_number}`,
        });
        console.log(
          `[SEND-REMINDERS] WhatsApp reminder sent | SID: ${whatsappMsg.sid} | To: ${appt.phone_number} | Time: ${new Date().toISOString()}`
        );
        sent = true;
      } catch (whatsappError) {
        console.log(
          `[SEND-REMINDERS] WhatsApp failed for ${appt.phone_number}: ${whatsappError.message}. Trying SMS.`
        );

        try {
          const smsMsg = await twilioClient.messages.create({
            body: messageBody,
            from: process.env.TWILIO_SMS_FROM,
            to: appt.phone_number,
          });
          console.log(
            `[SEND-REMINDERS] SMS reminder sent | SID: ${smsMsg.sid} | To: ${appt.phone_number} | Time: ${new Date().toISOString()}`
          );
          sent = true;
        } catch (smsError) {
          console.error(
            `[SEND-REMINDERS] Both channels failed for ${appt.phone_number}: ${smsError.message}`
          );
        }
      }

      // Mark the reminder as sent so we don't send duplicates on the next run
      if (sent) {
        const { error: updateError } = await supabase
          .from("appointments")
          .update({ reminder_sent: true })
          .eq("id", appt.id);

        if (updateError) {
          console.error(
            `[SEND-REMINDERS] Failed to update reminder_sent for ${appt.id}: ${updateError.message}`
          );
        }
        remindersSent++;
      }
    }

    console.log(`[SEND-REMINDERS] Total reminders sent: ${remindersSent}`);
    return res.status(200).json({ reminderssent: remindersSent });
  } catch (error) {
    console.error(`[SEND-REMINDERS] Unexpected error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
