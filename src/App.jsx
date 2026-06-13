import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient.js";
import "./App.css";

function formatAppointmentTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getMinDateTime() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.toISOString().slice(0, 16);
}

function getInitials(name) {
  return name ? name.substring(0, 2).toUpperCase() : "??";
}

export default function App() {
  const [isDark, setIsDark] = useState(true);
  
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [appointmentAt, setAppointmentAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const subscriptionRef = useRef(null);

  const fetchAppointments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("appointment_at", { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      setBanner({
        type: "error",
        title: "Failed to load appointments",
        message: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();

    if (!subscriptionRef.current) {
      const channel = supabase
        .channel("appointments-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "appointments" },
          () => {
            fetchAppointments();
          }
        )
        .subscribe();

      subscriptionRef.current = channel;
    }

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [fetchAppointments]);

  // Support for older browsers where :has() isn't supported for body background
  useEffect(() => {
    document.body.style.background = isDark ? "#0f172a" : "#f1f5f9";
  }, [isDark]);

  function validateForm() {
    if (!customerName.trim()) return false;
    if (!phoneNumber.trim() || !/^\+\d{7,15}$/.test(phoneNumber.trim())) return false;
    if (!appointmentAt || new Date(appointmentAt) <= new Date()) return false;
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return; 

    setSubmitting(true);
    setBanner(null);

    try {
      const { data: inserted, error: insertError } = await supabase
        .from("appointments")
        .insert({
          customer_name: customerName.trim(),
          phone_number: phoneNumber.trim(),
          appointment_at: new Date(appointmentAt).toISOString(),
        })
        .select()
        .single();

      if (insertError) throw insertError;

      try {
        const res = await fetch("/api/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: inserted.id,
            customerName: inserted.customer_name,
            phoneNumber: inserted.phone_number,
            appointmentAt: inserted.appointment_at,
          }),
        });

        const result = await res.json();

        if (result.success) {
          setBanner({
            type: "success",
            title: "Appointment booked!",
            message: `Confirmation sent via ${result.channel.toUpperCase()} to ${inserted.phone_number}. Appointment: ${formatAppointmentTime(inserted.appointment_at)}`,
          });

          // Auto-trigger the reminder 5 seconds later automatically (no tab switching needed!)
          setTimeout(() => {
            fetch("/api/send-reminders", { method: "POST" })
              .then(r => r.json())
              .then(data => console.log("[Auto-Reminder] Triggered:", data))
              .catch(err => console.error("[Auto-Reminder] Failed:", err));
          }, 5000);
        } else {
          setBanner({
            type: "success",
            title: "Appointment booked (message delivery issue)",
            message: `Saved for ${inserted.customer_name}, but confirmation message failed: ${result.error}`,
          });
        }
      } catch (apiErr) {
        setBanner({
          type: "success",
          title: "Appointment booked!",
          message: `Saved for ${inserted.customer_name}. Confirmation API unreachable.`,
        });
      }

      setCustomerName("");
      setPhoneNumber("");
      setAppointmentAt("");
      fetchAppointments();
    } catch (err) {
      setBanner({
        type: "error",
        title: "Booking failed",
        message: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkComplete(id) {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", id);
      if (error) throw error;
      fetchAppointments();
    } catch (err) {
      setBanner({ type: "error", title: "Update failed", message: err.message });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className={`app ${isDark ? 'dark' : 'light'}`}>
      <button
        className="theme-toggle"
        onClick={() => setIsDark(!isDark)}
        aria-label="Toggle theme"
      >
        <i className={isDark ? 'ti ti-sun' : 'ti ti-moon'}></i>
        {isDark ? 'Light' : 'Dark'}
      </button>

      <div className="header">
        <div className="header-ring" style={{width:'400px',height:'400px'}}></div>
        <div className="header-ring" style={{width:'650px',height:'650px'}}></div>
        <div className="header-icon">
          <i className="ti ti-message-circle" style={{fontSize:'28px',color:'#2dd4bf'}}></i>
        </div>
        <h1 className="header-title">
          WhatsApp <span>Appointment</span> Reminders
        </h1>
        <p className="header-subtitle">
          Book appointments and send instant WhatsApp confirmations
        </p>
      </div>

      {banner && (
        <div className="success-banner">
          <div className="success-icon">
            <i className={banner.type === "success" ? "ti ti-check" : "ti ti-alert-circle"}></i>
          </div>
          <div style={{ flex: 1 }}>
            <div className="success-title">{banner.title}</div>
            <div className="success-body">{banner.message}</div>
          </div>
          <button className="success-close" onClick={() => setBanner(null)}>×</button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <i className="ti ti-calendar-plus"></i>
          <span className="card-title">Book Appointment</span>
        </div>
        
        <form onSubmit={handleSubmit} noValidate style={{ marginTop: '16px' }}>
          <div className="field-group">
            <label className="field-label" htmlFor="customerName">Customer Name</label>
            <input
              id="customerName"
              type="text"
              className="field-input"
              placeholder="John Doe"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={submitting}
            />
          </div>
          
          <div className="field-group">
            <label className="field-label" htmlFor="phoneNumber">Phone Number</label>
            <input
              id="phoneNumber"
              type="tel"
              className="field-input"
              placeholder="+1234567890"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="appointmentAt">Appointment Date &amp; Time</label>
            <input
              id="appointmentAt"
              type="datetime-local"
              className="field-input"
              min={getMinDateTime()}
              value={appointmentAt}
              onChange={(e) => setAppointmentAt(e.target.value)}
              disabled={submitting}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? "Booking..." : "Book Appointment"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title">
          <i className="ti ti-list"></i>
          Appointments Dashboard
        </h2>

        <div className="appt-list">
          {loading ? (
            <div className="empty-state">Loading appointments...</div>
          ) : appointments.length === 0 ? (
            <div className="empty-state">No appointments found.</div>
          ) : (
            appointments.map((appt) => (
              <div className="appt-row" key={appt.id}>
                <div className="avatar">
                  {getInitials(appt.customer_name)}
                </div>
                
                <div className="appt-info">
                  <div className="appt-name">{appt.customer_name}</div>
                  <div className="appt-time">
                    {formatAppointmentTime(appt.appointment_at)} • {appt.phone_number}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {appt.reminder_sent && <span className="badge reminder">Reminded</span>}
                  <span className={`badge ${appt.status}`}>{appt.status}</span>
                  <i className="channel-icon ti ti-brand-whatsapp"></i>
                  
                  {appt.status !== 'completed' && appt.status !== 'cancelled' ? (
                    <button 
                      className="done-btn"
                      onClick={() => handleMarkComplete(appt.id)}
                      disabled={updatingId === appt.id}
                    >
                      {updatingId === appt.id ? "..." : "Done"}
                    </button>
                  ) : (
                    <div style={{ width: "42px" }}></div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
