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

// Weekly board
await page.goto("http://localhost:3000/plans/weekly");
await page.waitForSelector("text=לוח שבועי");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/30-weekly-board.png`, fullPage: true });

// History
await page.goto("http://localhost:3000/plans/history");
await page.waitForSelector("text=היסטוריית גרסאות");
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shots}/31-history.png`, fullPage: true });

// Resources availability strip
await page.goto("http://localhost:3000/resources");
await page.waitForSelector("text=משאבים");
await page.click('button:has-text("לוח זמינות")');
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/32-availability.png`, fullPage: false });

// Click a day to cycle status
await page.click('.flex-wrap button:has-text("זמין")');
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/33-availability-cycled.png`, fullPage: false });

console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);
await browser.close();
