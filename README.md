# Attitude Styles — merch store

Plain HTML/CSS/JS, no server is required for the public storefront. Serve the folder with any static
server (`python3 -m http.server`, VS Code Live Server, Netlify, etc.) and open `index.html`.

## Structure
- `index.html`, `shop/`, `about/`, `contact/` — storefront pages
- `admin/index.html` — admin dashboard (triple-click the footer copyright text)
- `js/data.js` — bundled default catalog and settings
- `js/store.js` — shop rendering and cart logic
- `js/checkout-message.js` — WhatsApp order message formatting
- `js/admin.js` — admin UI and save logic
- `supabase/migrations/` — database changes for protected admin features
- `assets/` — site media and product photos

## WhatsApp
Every WhatsApp link is driven by the stored `whatsapp` number in the catalog. Customers can review
their bag, add optional delivery contact details, and open a prefilled WhatsApp order. Availability,
delivery fees, and payment are confirmed in the chat; an item is not reserved by sending a message.

The admin Orders section is a manual log for orders confirmed in WhatsApp. It stores customer
contact/order details in a separate admin-only Supabase table; WhatsApp messages are not read by
the site, and stock is adjusted manually in Inventory after confirming an order.

## Performance and media
Product image uploads are resized and encoded as WebP where supported; transparent logos remain PNG.
The admin dashboard reports upload progress for media files and supports separate light- and
dark-mode logos. Product mock-ups fit inside their frames without being cropped. Gallery images are
optimized for their on-page display size. The homepage reel is hidden until a fresh video is uploaded
from admin, and section reveal animations are disabled to avoid scroll stutter. Static assets use a
short revalidation-friendly cache policy.

## Netlify + Supabase deployment
This project is now set up for a Netlify-hosted static storefront with a real Supabase-backed admin.
The public site remains static, while admin login and catalog persistence move to Supabase Auth + DB.

### 1. Install dependencies

```sh
npm install
```

### 2. Configure Supabase
Create a Supabase project and apply the SQL from `supabase/schema.sql`.
For the secure manual order log, also apply `supabase/migrations/0002_manual_orders.sql` in the
Supabase SQL editor. This creates a separate table protected by admin-only row-level security.
Set the project values as environment variables in Netlify:

```sh
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
ADMIN_ALLOWED_EMAILS=admin@example.com
```

The values are also documented in `.env.example`.

### 3. Netlify deploy
In Netlify, create a site from GitHub and use:

- Build command: `npm run build`
- Publish directory: `dist`

The project includes a `netlify.toml` for the build and publish settings.

### 4. Admin access
For production, use a verified Supabase auth user. The admin UI checks:
- the user is signed in
- the email is verified
- the email is in `ADMIN_ALLOWED_EMAILS` or the user is marked as an admin in the Supabase profile table

### 5. Local testing
Run the site locally and confirm the storefront loads:

```sh
npm run build
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes
- The old Cloudflare Pages backend files are not needed for Netlify.
- The frontend includes a Supabase-aware config layer in `js/config.js` and falls back to the bundled static data if no Supabase environment is configured.
- For a real production admin setup, mark the allowed admin profile in Supabase and require email verification in the Supabase dashboard.
