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

await page.goto("http://localhost:3000/plans/history");
await page.waitForSelector("text=היסטוריית גרסאות");
await page.waitForTimeout(1500);
const firstView = page.locator('a:has-text("צפייה")').first();
await firstView.click();
await page.waitForSelector("text=עריכה ידנית");
await page.click('button:has-text("עריכה ידנית")');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/40-editor-board.png`, fullPage: false });

// Drag first task from column 1 to column 2 using Playwright's native DnD API
const columns = page.locator(".w-72");
const col1Task = columns.nth(0).locator("[draggable=true]").first();
const col2Drop = columns.nth(1).locator(".min-h-\\[300px\\]");

const taskText = await col1Task.textContent();
console.log("Dragging task:", taskText);

await col1Task.dragTo(col2Drop);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${shots}/41-after-drag.png`, fullPage: false });

console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);
await browser.close();
