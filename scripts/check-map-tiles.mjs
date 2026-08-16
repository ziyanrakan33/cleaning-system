import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failed = [];
page.on("requestfailed", (req) => {
  if (req.url().includes("tile.openstreetmap.org")) {
    failed.push({ url: req.url(), error: req.failure()?.errorText });
  }
});
const responses = [];
page.on("response", (res) => {
  if (res.url().includes("tile.openstreetmap.org")) {
    responses.push({ url: res.url(), status: res.status() });
  }
});

await page.goto("http://localhost:3000/login");
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");

await page.goto("http://localhost:3000/map");
await page.waitForTimeout(4000);

console.log("Tile responses:", responses.slice(0, 5), "... total:", responses.length);
console.log("Failed tile requests:", failed.slice(0, 5), "... total:", failed.length);

await page.screenshot({ path: "smoke-screenshots/07-map-check.png" });
await browser.close();
