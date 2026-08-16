import { chromium } from "playwright";

const shots = "smoke-screenshots";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } }); // mobile-ish
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

// Admin: create employee user + assign to resource 01
const adminPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await adminPage.goto("http://localhost:3000/login");
await adminPage.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await adminPage.fill('input[name="password"]', "Admin123!");
await adminPage.click('button[type="submit"]');
await adminPage.waitForSelector("text=בקרה");

await adminPage.goto("http://localhost:3000/users");
await adminPage.waitForSelector("text=משתמשים");
await adminPage.fill('input[name="fullName"]', "עובד ראשון");
await adminPage.fill('input[type="email"]', "worker1@kfar-saba-cleaning.local");
await adminPage.fill('input[name="tempPassword"]', "Worker123!");
await adminPage.click('button:has-text("הוסף משתמש")');
await adminPage.waitForTimeout(1000);
await adminPage.screenshot({ path: `${shots}/50-users.png` });

await adminPage.goto("http://localhost:3000/resources");
await adminPage.waitForSelector("text=משאבים");
// Find resource 01's row and set employee
const row01 = adminPage.locator("tr", { hasText: "01" }).first();
await row01.locator("select").nth(0).selectOption({ label: "עובד ראשון" });
await adminPage.waitForTimeout(1000);
await adminPage.screenshot({ path: `${shots}/51-resource-assigned.png` });
await adminPage.close();

// Employee: log in and see today's tasks
await page.goto("http://localhost:3000/login");
await page.fill('input[name="email"]', "worker1@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Worker123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=התוכנית שלי היום", { timeout: 15000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${shots}/52-my-day.png` });

// Mark first task done
const doneBtn = page.locator('button:has-text("בוצע")').first();
if (await doneBtn.count() > 0) {
  await doneBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${shots}/53-my-day-after-done.png` });
}

console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);
await browser.close();
