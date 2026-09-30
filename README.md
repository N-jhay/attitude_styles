# Attitude Styles — merch store

Plain HTML/CSS/JS, no server is required for the public storefront. Serve the folder with any static
server (`python3 -m http.server`, VS Code Live Server, Netlify, etc.) and open `index.html`.

## Structure
- `index.html`, `shop/`, `about/`, `contact/` — storefront pages
- `admin/index.html` — admin dashboard (triple-click the footer copyright text)
- `js/data.js` — bundled default catalog and settings
- `js/store.js` — shop rendering and cart logic
- `js/admin.js` — admin UI and save logic
- `assets/` — site media and product photos

## WhatsApp
Every WhatsApp link is driven by the stored `whatsapp` number in the catalog.

## Netlify + Supabase deployment
This project is now set up for a Netlify-hosted static storefront with a real Supabase-backed admin.
The public site remains static, while admin login and catalog persistence move to Supabase Auth + DB.

### 1. Install dependencies

```sh
npm install
```

### 2. Configure Supabase
Create a Supabase project and apply the SQL from `supabase/schema.sql`.
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
