const { chromium } = require('playwright');

(async () => {
  console.log("Starting Chrome...");
  const browser = await chromium.launch();
  try {
    // 1. Test Owner Dashboard
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const errors1 = [];
    page1.on('console', msg => {
      if (msg.type() === 'error') errors1.push(msg.text());
      if (msg.text().includes('api.getStaffMembers')) errors1.push(msg.text());
    });
    
    console.log("Testing Owner Dashboard login...");
    await page1.goto('http://localhost:5178/login');
    await page1.fill('input[type="email"]', 'owner@elisbakery.com');
    await page1.fill('input[type="password"]', 'ElisBakery123');
    await Promise.all([
      page1.waitForNavigation({ url: '**/owner-dashboard**' }),
      page1.click('button[type="submit"]')
    ]);
    await page1.waitForTimeout(2000); // Wait for metrics
    console.log("Owner Dashboard Console Errors:", errors1.length ? errors1 : "None");
    await context1.close();

    // 2. Test Front Desk
    console.log("Testing Front Desk login...");
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const errors2 = [];
    page2.on('pageerror', error => errors2.push(error.message));
    page2.on('console', msg => {
      if (msg.type() === 'error') errors2.push(msg.text());
      if (msg.text().includes('api.getStaffMembers')) errors2.push(msg.text());
    });
    
    await page2.goto('http://localhost:5178/login');
    await page2.fill('input[type="email"]', 'orders@elisbakery.com');
    await page2.fill('input[type="password"]', 'OrdersElisBakery123');
    await Promise.all([
      page2.waitForNavigation({ url: '**/front-desk**' }),
      page2.click('button[type="submit"]')
    ]);
    await page2.waitForTimeout(2000);
    console.log("Front Desk Console Errors:", errors2.length ? errors2 : "None");
    await context2.close();
  } catch (e) {
    console.error("Script error:", e);
  } finally {
    await browser.close();
  }
})();
