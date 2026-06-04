# 📱 WhatsApp & SMS Appointment Booking & Reminder System

A production-ready, full-stack appointment booking and reminder application. It features a real-time responsive dashboard, instant automated confirmations via Twilio (with fallback SMS delivery), and a background cron job for sending upcoming appointment alerts.

This repository is designed with **security best practices, enterprise architecture patterns, and clean code principles** to show how modern web technologies scale.

---

## 🏗️ Architecture & Data Flow

Below is the architectural representation of how the application operates:

```mermaid
graph TD
    %% Frontend Layer
    subgraph Client [Client-Side App]
        ReactForm[React Booking Form]
        Dashboard[Real-time Dashboard]
    end

    %% Database & Realtime Layer
    subgraph Database [Database Layer]
        Supabase[(Supabase PostgreSQL)]
    end

    %% Serverless Backend Layer
    subgraph Backend [Vercel Serverless Functions]
        ConfAPI[POST /api/send-confirmation]
        RemindAPI[GET /api/send-reminders]
    end

    %% Messaging Services Layer
    subgraph Communications [Messaging Gateway]
        Twilio[Twilio API Client]
        WhatsApp[WhatsApp Sandbox]
        SMS[SMS Gateway]
    end

    %% Scheduler
    Scheduler[External Cron Scheduler] -- 1-Minute Trigger --> RemindAPI

    %% Interactions
    ReactForm -- 1. Insert Appointment --> Supabase
    ReactForm -- 2. Trigger Confirmation --> ConfAPI
    ConfAPI -- 3. Validate & Initiate --> Twilio
    Twilio -- 4a. Attempt Delivery --> WhatsApp
    Twilio -- 4b. Fallback (If Sandbox fails) --> SMS
    ConfAPI -- 5. Update Status to 'confirmed' --> Supabase
    
    Supabase -- PostgreSQL Realtime Subscription --> Dashboard
    
    RemindAPI -- Query 1-Hour Window --> Supabase
    RemindAPI -- Send Alert --> Twilio
    RemindAPI -- Mark reminder_sent=true --> Supabase
```

---

## 🛠️ Tech Stack & Key Choices

* **Frontend**: **React 18** built on **Vite** for optimized fast builds. Custom responsive **CSS** using CSS variables for clean dark/light mode toggles.
* **Database**: **Supabase (PostgreSQL)** leveraging Postgres Realtime Engine to push database mutations straight to the UI.
* **Messaging APIs**: **Twilio API** supporting multi-channel messaging.
* **Backend Runtime**: **Vercel Serverless Functions (Node.js/ESM)** for building lightweight, scalable APIs.

---

## 🔒 Professional Engineering & Security Practices

When reviewing this codebase, the hiring manager should pay attention to these design choices:

### 1. Zero-Trust API Key Security
* **Client-Side Isolation**: The React frontend only exposes non-sensitive environment variables prefixed with `VITE_` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Client-side read/write operations are secure and guarded by Supabase policies.
* **Secret Containment**: Twilio credentials (`TWILIO_ACCOUNT_SID` & `TWILIO_AUTH_TOKEN`) are kept strictly server-side. They are never compiled into the client bundle and are accessed only within secure Vercel Serverless Functions (`/api/*`).
* **Environment Protection**: A `.gitignore` rule is configured to ensure that local `.env` and deployment configuration files are never committed to version control.

### 2. Reliable Delivery: Fallback Pattern
In `api/send-confirmation.js`, the messaging logic implements a fallback mechanism:
1. It attempts to send a high-priority **WhatsApp message** (the primary channel).
2. If delivery fails (e.g., the recipient number has not accepted the Twilio Sandbox join request, or WhatsApp is unreachable), it catches the exception, logs it, and immediately routes the alert as a standard **SMS**.
3. If both fail, it reports a structured error upstream without crashing the serverless instance.

### 3. PostgreSQL Real-time Sync
Instead of running continuous client-side polling, the frontend subscribes to real-time postgres changes using Supabase:
```javascript
const channel = supabase
  .channel("appointments-realtime")
  .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
    fetchAppointments(); // Automatically refreshes the UI state on Insert/Update/Delete
  })
  .subscribe();
```

### 4. Background Reminder System
The reminder background process runs inside `/api/send-reminders.js`. It queries upcoming appointments in a strict sliding window time range:
* It looks for appointments due in the next **65 minutes** that have not yet had a reminder sent (`reminder_sent = false`).
* Pushes out notifications and updates the database row instantly to ensure **exactly-once** messaging delivery.

---

## 📁 Repository Directory Structure

```
.
├── api/
│   ├── send-confirmation.js    # POST: Processes new appointments & dispatches confirmations
│   └── send-reminders.js       # GET/POST: Queries upcoming events & dispatches alerts
├── src/
│   ├── App.jsx                 # React UI entry point, form logic, and dashboard
│   ├── App.css                 # Custom styles, styling themes, and glassmorphic UI variables
│   ├── main.jsx                # React bootstrapper
│   └── supabaseClient.js       # Supabase client singleton setup
├── supabase/
│   └── migrations/
│       └── 001_create_appointments.sql  # Database schema definition script
├── vercel.json                 # Vercel deployment configuration
├── vite.config.js              # Vite application config
├── .env.example                # Blueprint for local configurations
├── .gitignore                  # Security filter ignoring sensitive environment properties
└── README.md                   # System documentation
```

---

## ⚙️ How to Run Locally

### 1. Initialize the Database
1. Set up a free project on [Supabase](https://supabase.com/).
2. Run the SQL schema script located in `supabase/migrations/001_create_appointments.sql` using the Supabase SQL editor.
3. Turn on database replication for real-time updates:
   * Go to Database -> Replication in your Supabase dashboard and enable replication for the `appointments` table.

### 2. Initialize Messaging Sandbox
1. Set up a free developer trial account on [Twilio](https://www.twilio.com/).
2. Follow the steps on your Twilio Console under **Messaging → Try it out → Send a WhatsApp message** to activate your WhatsApp sandbox.
3. Note your Sandbox WhatsApp phone number and your account credentials.

### 3. Setup Environment Variables
Clone the env template to `.env`:
```bash
cp .env.example .env
```
Fill in the values in your `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-public-anon-key
TWILIO_ACCOUNT_SID=ACyourtwilioaccountsid
TWILIO_AUTH_TOKEN=yourtwilioauthtoken
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+1yourtwiliosmsnumber
```

### 4. Build and Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local client server:
   ```bash
   npm run dev
   ```
3. To test serverless API functions locally, install the [Vercel CLI](https://vercel.com/docs/cli) and run:
   ```bash
   npx vercel dev
   ```

---

## 🚀 How to Deploy on Vercel (Hobby Tier)

1. **GitHub Upload**: Push this project to a **Private** GitHub repository. (Since `.env` is listed in `.gitignore`, your secrets are 100% safe and will not be pushed).
2. **Import Project**: Log in to [Vercel Dashboard](https://vercel.com/), select **Add New Project**, and import your repository.
3. **Environment Settings**: Add the environment variables listed in your `.env` configuration file to **Project Settings → Environment Variables**.
4. **Deploy**: Click deploy. Vercel will build the React build outputs, host them, and expose the Serverless Functions automatically.
5. **Setting up the Cron**: Since Vercel native crons require a Pro subscription, set up a free scheduler on [cron-job.org](https://cron-job.org/) to trigger `GET https://your-project.vercel.app/api/send-reminders` every 1 minute.

---

## 📈 Potential Future Enhancements
* **User Authentication**: Implementing Supabase Auth to enable dashboard logins and secure multi-tenant scheduling data.
* **Bi-directional Webhooks**: Processing incoming messages (e.g., text replies like "CANCEL" or "RESCHEDULE") via Twilio webhooks to allow direct booking management from WhatsApp.
* **Timezone Localization**: Enhancing fields to store user specific timezones and converting times dynamically before dispatching Twilio alerts.
