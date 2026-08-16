import { chromium } from "playwright";

const shots = "smoke-screenshots";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto("http://localhost:3000/login");
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");

await page.goto("http://localhost:3000/plans");
await page.waitForSelector("text=תוכניות עבודה");
await page.click('button:has-text("צור תוכנית עבודה")');
await page.waitForSelector("text=גרסה", { timeout: 30000 });
await page.click('a:has-text("צפייה במפה ובמסלולים")');
await page.waitForSelector(".maplibregl-canvas");
await page.waitForTimeout(5000);
await page.screenshot({ path: `${shots}/21-plan-detail-map.png`, fullPage: false });

console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);

await browser.close();
