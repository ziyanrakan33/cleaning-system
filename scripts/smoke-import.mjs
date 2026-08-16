import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

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

await page.goto("http://localhost:3000/streets");
await page.waitForSelector("text=רחובות ושבילים");

// --- Manual add ---
await page.click('button:has-text("הוסף רחוב/שביל ידנית")');
await page.waitForSelector("text=הוספת רחוב/שביל");
await page.fill('form input[required]', "רחוב הבדיקה הידני");
await page.click('button:has-text("הוסף"):not(:has-text("ידנית"))');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shots}/80-after-manual-add.png` });

// --- CSV import ---
const csvPath = path.resolve("smoke-screenshots/test-import.csv");
fs.writeFileSync(
  csvPath,
  "שם,סוג,אזור,עדיפות,תדירות,אורך_מטר,זמן_ניקיון_דקות,הערות\n" +
  "רחוב ייבוא בדיקה 1,רחוב,,גבוה,כל יום,200,20,הערת בדיקה\n" +
  "רחוב ייבוא בדיקה 2,שביל,,נמוך,לפי צורך,50,5,\n",
  "utf-8"
);

await page.click('button:has-text("ייבוא מ-Excel/CSV")');
await page.waitForSelector("text=ייבוא רחובות ושבילים");
await page.setInputFiles('input[type="file"]', csvPath);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${shots}/81-after-import.png` });

console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);
await browser.close();
