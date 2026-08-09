import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "umma-christians-main");
const distDir = path.join(rootDir, "dist");
const appDistDir = path.join(distDir, "umma-christians-main");

const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(appDistDir, { recursive: true });
fs.cpSync(sourceDir, appDistDir, { recursive: true });
fs.copyFileSync(path.join(rootDir, "index.html"), path.join(distDir, "index.html"));

const runtimeConfig = [
    "window.__SUPABASE__ = {",
    `  url: ${JSON.stringify(supabaseUrl)},`,
    `  anonKey: ${JSON.stringify(supabaseAnonKey)}`,
    "};",
    ""
].join("\n");

fs.writeFileSync(path.join(appDistDir, "runtime-config.js"), runtimeConfig, "utf8");
