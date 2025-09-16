# CodexStarDM Supabase Setup

This project integrates with [Supabase](https://supabase.com/) to provide storage for core entities such as users, wallets, coupons, QR tokens, and redemption tracking.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment variables**
   - Copy `.env.example` to `.env` and fill in the values from your Supabase project dashboard.
   - The Supabase client helper loads the `.env` file automatically.

3. **Using the Supabase client helper**
   ```javascript
   const { supabase, getServiceRoleClient } = require('./supabase/client');

   async function example() {
     const { data, error } = await supabase.from('coupons').select('*');
     if (error) throw error;
     console.log(data);
   }

   example();
   ```

4. **Database migrations**
   - The schema and Row-Level Security (RLS) policies are defined in `supabase/migrations/20240507120000_initial_schema.sql`.
   - Apply the migration with the Supabase CLI:
     ```bash
     supabase migration up
     ```

## Database Model Overview

- **users** — profile metadata and system role for each authenticated user.
- **wallets** — per-user wallet balances with currency and status controls.
- **coupons** — merchant-authored promotions with lifecycle and usage limits.
- **qr_tokens** — tokens issued for coupon redemption, supporting expiration and revocation.
- **coupon_redemptions** — audit trail of redemptions tied to users, wallets, and QR tokens.
- **wallet_transactions** — ledger entries for wallet debits/credits linked to redemptions.

Row-Level Security policies enforce role-based access for admins, merchants, customers, and service-role automation.
