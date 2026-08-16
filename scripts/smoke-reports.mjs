import { chromium } from "playwright";
import fs from "node:fs";

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

await page.goto("http://localhost:3000/reports");
await page.waitForSelector("text=דוחות");
await page.screenshot({ path: `${shots}/70-reports.png` });

// Print views (reuse the same authenticated page)
await page.goto("http://localhost:3000/reports/daily/print");
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shots}/71-daily-print.png`, fullPage: true });

await page.goto("http://localhost:3000/reports/unscheduled/print");
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shots}/72-unscheduled-print.png`, fullPage: true });

// Excel download
const downloadPromise = page.waitForEvent("download");
await page.goto("http://localhost:3000/reports");
await page.click('a:has-text("הורדה כ-Excel") >> nth=0');
const download = await downloadPromise;
const savePath = "smoke-screenshots/daily-plan.xlsx";
await download.saveAs(savePath);
console.log("Excel file downloaded:", fs.existsSync(savePath), fs.statSync(savePath).size, "bytes");

console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);
await browser.close();
