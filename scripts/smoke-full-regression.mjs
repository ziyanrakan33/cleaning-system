import { chromium } from "playwright";

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[console] ${page.url()} :: ${msg.text()}`); });
page.on("pageerror", (err) => errors.push(`[pageerror] ${page.url()} :: ${err}`));
page.on("response", (res) => {
  if (res.status() >= 500) errors.push(`[${res.status()}] ${res.url()}`);
});

await page.goto("http://localhost:3000/login");
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");

const routes = [
  "/",
  "/map",
  "/sources",
  "/streets",
  "/zones",
  "/resources",
  "/defects",
  "/complaints",
  "/inspections",
  "/users",
  "/plans",
  "/plans/weekly",
  "/plans/history",
  "/reports",
  "/reports/daily/print",
  "/reports/unscheduled/print",
  "/reports/plan-vs-actual",
  "/reports/weekly-zone/print",
  "/reports/monthly-contractor/print",
  "/reports/by-resource/print",
  "/reports/by-worker/print",
  "/reports/shift/print",
  "/reports/zone-vehicles/print",
  "/reports/hours/print",
  "/reports/streets-completion/print",
  "/reports/km/print",
  "/reports/defects/print",
  "/reports/quality-control/print",
  "/reports/resource-utilization/print",
  "/reports/city-coverage/print",
  "/reports/source-conflicts/print",
  "/reports/pending-verification/print",
  "/reports/gps-deviations",
];

for (const route of routes) {
  await page.goto(`http://localhost:3000${route}`);
  await page.waitForTimeout(1500);
  console.log("visited", route);
}

// also visit an existing plan detail page
const planLink = await page.goto("http://localhost:3000/plans/history").then(async () => {
  await page.waitForTimeout(1500);
  const href = await page.locator('a:has-text("צפייה")').first().getAttribute("href");
  return href;
});
if (planLink) {
  await page.goto(`http://localhost:3000${planLink}`);
  await page.waitForTimeout(3000);
  console.log("visited plan detail", planLink);
}

console.log("\nTotal errors:", errors.length);
for (const e of errors) console.log(" -", e);

await browser.close();
