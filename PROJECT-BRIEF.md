PROJECT CONTEXT: FREELANCER PAYMENT + PROPOSAL MINI-SAAS

Goal:
Build a focused mini-SaaS for freelancers and small service businesses that helps them go from proposal → approval → deposit → invoice → automated payment reminders → paid.

Core positioning:
“Send the invoice. We chase the payment.”
Alternative:
“From proposal to payment, without the awkward follow-ups.”

Primary user:

- Freelancers
- Consultants
- Small agencies
- Designers
- Developers
- Marketers
- Photographers
- Coaches
- Other service-based solo businesses

Main pain points:

- Clients paying invoices late
- Awkward manual follow-ups
- Forgetting to chase invoices
- Unclear invoice status
- Proposals taking too long to create
- Clients not responding to proposals
- Scope creep / unpaid extra work
- Deposits and milestone payments being poorly managed

Important product philosophy:
Do NOT build a full accounting app.
Do NOT compete directly with QuickBooks/Xero.
Keep the product tightly focused on:
proposal → invoice → follow-up → payment.

MVP FEATURES

1. Authentication

- Sign up/login
- User profile
- Business profile:
  - business name
  - logo
  - address
  - tax/VAT details
  - default currency
  - default payment terms
  - default reminder settings

2. Client management

- Add/edit/delete clients
- Client name
- Company
- Email
- Billing address
- Notes
- Default payment terms
- Custom reminder behavior
- Client history

3. Invoice creation

- Invoice number
- Client
- Issue date
- Due date
- Line items
- Quantity
- Price
- Tax/VAT
- Discount
- Notes
- Payment instructions
- Currency
- PDF invoice
- Hosted invoice page
- Draft / sent / viewed / overdue / paid / partially paid statuses

4. Payment tracking

- Manual mark as paid
- Partial payments
- Remaining balance
- Stripe payment link or Stripe Checkout
- Detect successful Stripe payments automatically
- Stop reminder sequence automatically after payment

5. Automated invoice reminders
   This is one of the main product features.

Default reminder sequence example:

- 3 days before due date: friendly reminder
- due date: payment reminder
- 3 days overdue: polite follow-up
- 7 days overdue: firmer follow-up
- 14 days overdue: strong reminder
- 30 days overdue: final reminder

User should be able to:

- turn reminders on/off
- choose a reminder template
- customize timing
- pause reminders
- skip weekends
- set client-specific reminder rules

Reminder tone presets:

- Friendly
- Professional
- Firm
- VIP / gentle

6. Chasing Autopilot
   Simple presets:
   Gentle:

- due date
- +7 days
- +14 days

Standard:

- -3 days
- due date
- +3 days
- +7 days
- +14 days

Aggressive:

- due date
- +2 days
- +5 days
- +10 days
- +20 days

User should be able to activate Autopilot with one click.

7. Email sending
   Initial MVP:

- Send from app domain
- Sender name should show the freelancer/business name
- Reply-To should be the freelancer’s real email

Later / Pro:

- Connect Gmail via OAuth
- Connect Outlook/Microsoft 365 via OAuth
- Send reminders and proposals from the user’s actual email account
- Store OAuth refresh tokens securely/encrypted

Do not request unnecessary inbox permissions initially.
Prefer send-only permissions.

8. Email/invoice tracking
   Track:

- invoice sent
- invoice opened/viewed
- reminder sent
- last reminder
- number of reminders
- last invoice-page view
- payment status

Dashboard example:
Invoice #1042
$2,400
6 days overdue
Opened 4 times
Last viewed today
Next reminder tomorrow

9. Proposal builder
   Include proposals in the same product.

Proposal flow:
proposal → client approval → deposit → invoice

Proposal fields:

- client
- title
- project summary
- scope
- deliverables
- timeline
- exclusions
- pricing
- optional packages
- terms
- notes

Features:

- branded proposal page
- proposal PDF
- viewed status
- accepted/declined status
- client approval or basic e-signature
- convert accepted proposal to invoice
- request deposit immediately
- automated proposal follow-ups if client does not respond

10. Deposits and payment schedules
    Support:

- fixed deposits
- percentage deposits
- 50/50
- 30/40/30
- milestone-based payment schedules

11. Payment promises
    If a client says “I’ll pay Friday”:

- user can record payment promise date
- reminders pause until that date
- if unpaid after promised date, reminders resume

12. Recurring invoices
    Later MVP / V2:

- monthly retainers
- recurring billing schedules
- automatic invoice creation
- automatic reminder sequences

13. Scope/change requests
    Later feature:

- log extra client requests
- show whether work is in/out of scope
- create change request
- assign price
- send for client approval
- convert approved change request to invoice

14. Dashboard
    Keep dashboard simple and financial.

Top stats:

- outstanding amount
- overdue amount
- collected this month
- unpaid invoices count

Main table:
Client | Invoice | Amount | Status | Due Date | Next Action

Important states:

- Draft
- Sent
- Viewed
- Due Soon
- Overdue
- Payment Promised
- Partially Paid
- Paid

15. “Recommended next action”
    For each overdue invoice show:

- recommended next step
- reason
- one-click action

Example:
“This invoice is 11 days overdue. The client viewed it yesterday. Send a firmer reminder today.”

AI can assist with wording but AI is NOT the core product.

16. Reminder templates
    Templates should use variables:
    {{client_name}}
    {{business_name}}
    {{invoice_number}}
    {{amount_due}}
    {{due_date}}
    {{days_overdue}}
    {{payment_link}}

Tone should become progressively firmer as invoice ages.

17. Export/history
    Provide:

- complete invoice history
- email/reminder log
- payment history
- downloadable PDF
- optional export of communication timeline

Long-term positioning:
This should become the freelancer’s revenue workflow:
proposal → approval → deposit → invoice → reminders → paid

NOT:

- bookkeeping
- payroll
- expenses
- inventory
- bank reconciliation
- full CRM
- project management

PRICING IDEA

Free:

- 5 invoices/month
- basic reminders

Solo: ~$19/month

- unlimited invoices
- automated reminders
- hosted payment pages
- invoice tracking

Pro: ~$29/month

- proposals
- Gmail/Outlook connection
- recurring invoices
- deposits
- advanced reminder sequences
- payment promises

Studio: ~$49/month

- multiple team members
- multiple businesses/brands
- advanced reporting
- higher limits

CHATGPT ADS STRATEGY

This product is specifically designed to convert from high-intent ChatGPT conversations.

Example conversation:
“My client hasn’t paid my invoice in 3 weeks. How do I follow up without sounding rude?”

Possible ad:
Title:
Stop Chasing Invoices

Description:
Send your invoice once. Automatically follow up until you get paid.

Another:
Title:
Get Paid Without the Awkward Follow-Ups

Description:
Automate polite invoice reminders and know exactly when clients view and pay.

Another high-intent conversation:
“How do I write a freelance proposal for this client?”

Ad:
Create the Proposal. Get the Deposit.

Landing pages should be intent-specific.

Suggested landing pages:
/late-invoice-reminders
/freelance-invoicing
/freelance-proposal
/payment-reminders
/client-not-paying
/proposal-to-invoice

Main acquisition channels:

- ChatGPT Ads
- Google Search
- SEO
- freelancer communities
- referral/viral client-facing pages

IMPORTANT PRODUCT METRICS

Track:

- signup
- client created
- first invoice created
- first invoice sent
- reminder automation enabled
- proposal created
- payment link created
- invoice viewed
- payment received
- second invoice created
- second client created
- subscription started
- churn

Key activation metric:
User sends first invoice AND enables automatic reminders.

Key retention metric:
User creates another invoice/proposal for a new or returning client after the first payment problem is solved.

The biggest product risk:
Users join to chase one late invoice, get paid, then cancel.

The product must become useful for ALL future client revenue activity.

TECHNICAL NOTES

Suggested architecture:

- Next.js / React frontend
- PostgreSQL database
- Prisma or similar ORM
- Auth provider or secure custom auth
- Stripe for subscriptions/payments
- Transactional email provider for MVP
- Gmail OAuth later
- Microsoft Graph OAuth later
- background job queue for scheduled reminders
- cron/scheduler for due-date checks
- webhook handling for Stripe payments
- secure object storage for PDFs/logos
- encrypted OAuth tokens
- audit log for reminders and payments

Core entities likely needed:
User
Business
Client
Proposal
ProposalItem
Invoice
InvoiceItem
Payment
ReminderRule
ReminderEvent
EmailEvent
PaymentPromise
Subscription
OAuthConnection

Security:

- strict tenant isolation
- encrypted secrets/tokens
- secure file access
- signed URLs
- audit logs where useful
- never expose client financial data publicly
- rate-limit public invoice/proposal pages

UX STYLE

The UI should feel:

- simple
- calm
- trustworthy
- professional
- freelancer-friendly
- not “enterprise accounting software”

The app should make the user feel:
“I don’t need to think about chasing money anymore.”

Avoid visual/accounting complexity.

PRIMARY MVP FLOW

1. User signs up
2. Adds business details
3. Adds client
4. Creates invoice
5. Chooses reminder autopilot
6. Sends invoice
7. Client views hosted invoice page
8. Client pays via Stripe/payment link
9. System detects payment
10. Reminder sequence stops
11. Dashboard updates to Paid
12. User creates next invoice

SECONDARY FLOW

1. User creates proposal
2. Client views proposal
3. Client accepts
4. Deposit requested
5. Deposit paid
6. Proposal converts to invoice/project payment schedule
7. Future reminders handled automatically
