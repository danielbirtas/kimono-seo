# Privacy Policy — Kimono BI

**Last updated:** March 2026

## What data we collect

Kimono BI accesses the following Shopify store data through the Shopify Admin API:

- **Orders** (read-only): Order totals, dates, line items, and channel information for analytics, revenue tracking, and AI-generated business insights.
- **Customers** (read-only): Customer names, email addresses, order history, and spending data for RFM segmentation and cohort analysis.
- **Products** (read-only): Product titles, inventory levels, variants, and pricing for stock alerts and product performance analytics.
- **Inventory** (read-only): Stock quantities for low-stock monitoring and alerts.

## How we use your data

We use your store data exclusively to:

1. Generate business intelligence dashboards and analytics
2. Provide AI-powered business recommendations and reports
3. Calculate RFM (Recency, Frequency, Monetary) customer segments
4. Perform cohort retention analysis
5. Monitor stock levels and send alerts
6. Create periodic dashboard snapshots for trend analysis

## AI processing

When you use the AI Advisor feature, anonymized and aggregated store metrics (not individual customer personal data) are sent to OpenAI's API to generate business insights. We do not send raw customer names, emails, or addresses to any AI provider.

## Data storage

- Store metadata, settings, and analytics snapshots are stored in a PostgreSQL database hosted on Neon (AWS us-east-1).
- The application is hosted on Railway.
- We do not sell, rent, or share your data with third parties.
- Data retention follows your subscription plan limits (7 to 365 days depending on plan).

## Data deletion

When you uninstall Kimono BI, we receive a webhook notification from Shopify and schedule deletion of all your store data within 48 hours. You can also request immediate data deletion by contacting us.

## Your rights

You have the right to:
- Access all data we store about your shop
- Request correction of inaccurate data
- Request deletion of your data at any time
- Export your data in a machine-readable format

## Contact

For privacy inquiries, data requests, or questions:

- **Email:** office@kimonogroup.ro
- **Company:** Kimono Group SRL
- **Address:** Baia Mare, Romania

## Changes

We may update this policy from time to time. We will notify you of significant changes through the app or via email.
