# Kimono BI — App Store Submission Checklist

## Pre-submission

### Code & Functionality
- [x] All 9 modules working (Dashboard, Settings, AI Advisor, Stock Alerts, RFM, Cohorts, Analytics, Customers, Products)
- [x] Billing API implemented (Free / $49 / $99 / $199 with 14-day trials)
- [x] Feature gating per plan (7 routes gated)
- [x] AI usage limits with overage tracking
- [x] Error handling in all loaders (try/catch)
- [x] Webhook for subscription updates
- [x] Meta Ads removed, template junk cleaned
- [ ] Test billing flow on dev store (subscribe, cancel, resubscribe)
- [ ] Test uninstall/reinstall flow

### shopify.app.toml
- [x] Correct scopes: read_orders, read_customers, read_inventory, read_products
- [x] Webhooks: app/uninstalled, app/scopes_update, app_subscriptions/update
- [x] Customer data access declared with reason
- [ ] Run: shopify app deploy

### App Store Listing
- [ ] App name: "Kimono BI — AI Business Advisor"
- [ ] Tagline written
- [ ] Full description written
- [ ] 4-6 screenshots (Dashboard, AI Advisor, RFM, Cohorts, Stock Alerts, Pricing)
- [ ] App icon (512x512 PNG)
- [ ] Privacy policy URL (host docs/PRIVACY-POLICY.md somewhere public)
- [ ] Support URL / email

### Protected Customer Data
- [ ] Go to Partner Dashboard → App → API access
- [ ] Under "Protected customer data access", click "Request access"
- [ ] Select: Customer name, email, phone, address
- [ ] Reason: "RFM segmentation, cohort analysis, customer insights, AI business reports"
- [ ] Describe data handling: stored in encrypted PostgreSQL, deleted on uninstall
- [ ] Submit and wait for approval (usually 1-3 business days)

### Final Deploy
- [ ] Push all changes to git
- [ ] Deploy to Railway (production)
- [ ] Run: shopify app deploy
- [ ] Test on production URL: https://kimono-bi-production.up.railway.app
- [ ] Verify all routes load without errors
- [ ] Verify billing works on dev store

### Submit
- [ ] Go to Partner Dashboard → App → Distribution
- [ ] Click "Submit for review"
- [ ] Estimated review time: 3-7 business days
