import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const supabaseUrl = process.env.SUPABASE_URL || "https://example.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "demo-anon-key";
const adminAllowedEmails = (process.env.ADMIN_ALLOWED_EMAILS || "admin@example.com")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const config = `window.APP_CONFIG = {
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},
  adminAllowedEmails: ${JSON.stringify(adminAllowedEmails)},
};\n`;

const publicPaths = ["index.html", "shop", "about", "contact", "admin", "assets", "css", "js", "_headers"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
for (const path of publicPaths) cpSync(path, `dist/${path}`, { recursive: true });
writeFileSync("dist/js/config.js", config);
