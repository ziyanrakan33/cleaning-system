import { chromium } from "playwright";

const shots = "smoke-screenshots";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto("http://localhost:3000");
await page.waitForSelector("text=כניסה");
await page.screenshot({ path: `${shots}/01-login.png` });

await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");
await page.screenshot({ path: `${shots}/02-dashboard.png` });

await page.goto("http://localhost:3000/streets");
await page.waitForSelector("text=רחובות ושבילים");
await page.waitForTimeout(2500); // let map tiles + geojson load
await page.screenshot({ path: `${shots}/03-streets.png` });

await page.goto("http://localhost:3000/zones");
await page.waitForSelector("text=אזורי עבודה");
await page.screenshot({ path: `${shots}/04-zones.png` });

await page.goto("http://localhost:3000/resources");
await page.waitForSelector("text=משאבים");
await page.screenshot({ path: `${shots}/05-resources.png` });

await page.goto("http://localhost:3000/map");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}/06-map.png` });

await browser.close();

console.log("Console/page errors:", errors.length);
for (const e of errors) console.log(" -", e);
console.log("Done. Screenshots in", shots);
