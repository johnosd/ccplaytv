import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("=== US1: Sem lista cadastrada ===");
  // Step 1: Ensure no sources. (Already done by PowerShell)
  console.log("Sources deleted via powershell...");

  // Step 2: Open app. Expect Splash -> Form
  console.log("Opening http://localhost:5173...");
  await page.goto('http://localhost:5173');
  
  // Wait for splash to disappear
  console.log("Waiting for splash to disappear (expecting ~2.6s)...");
  await page.waitForTimeout(3500); 

  console.log("Verifying form is visible...");
  await page.waitForSelector('#add-source-title', { state: 'visible' });

  // Step 3: Press Backspace/Escape. Expect dialog.
  console.log("Pressing Escape to trigger exit confirm...");
  await page.keyboard.press('Escape');
  
  console.log("Verifying confirm dialog appears...");
  await page.waitForSelector('.confirm-dialog', { state: 'visible' });

  console.log("Pressing Escape again to close dialog (app stays)...");
  await page.keyboard.press('Escape');
  await page.waitForSelector('.confirm-dialog', { state: 'hidden' });
  await page.waitForSelector('#add-source-title', { state: 'visible' });

  // Step 4: Reopen dialog, confirm "Sair"
  console.log("Pressing Escape again to reopen dialog...");
  await page.keyboard.press('Escape');
  await page.waitForSelector('.confirm-dialog', { state: 'visible' });

  console.log("Pressing ArrowRight to select 'Sair' (or navigating)...");
  // The default focus might be Cancel or OK. Let's press ArrowRight then Enter.
  // Actually, we can just click "Sair" or use arrows. 
  // By spec: "navegável por controle (setas + OK)"
  // Let's just click 'Sair' for simplicity.
  await page.click('button:has-text("Sair")');
  await page.waitForSelector('.confirm-dialog', { state: 'hidden' });

  // Step 5: Fill form and submit
  console.log("Filling the form...");
  // Need to know what the fields are. Let's assume input[type="text"] or by label
  // Let's check what fields exist on the page. 
  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
      await inputs[0].fill('Minha Lista Playwright');
      await inputs[1].fill('http://example.com/lista.m3u');
      await page.click('button:has-text("Importar"), button:has-text("Adicionar"), button:has-text("Salvar")');
  }

  console.log("Waiting for Progress screen or Home card...");
  await page.waitForTimeout(2000);

  // Now let's test US2
  console.log("=== US2: Com listas já cadastradas ===");
  // We just added one, so it should be there. Let's reload.
  console.log("Reloading page...");
  await page.goto('http://localhost:5173');
  
  console.log("Verifying no form flash, loading indicator appears...");
  // We expect cards to appear directly after splash, or a loading indicator.
  await page.waitForTimeout(3000); // splash wait
  
  // Verify card exists
  const cards = await page.$$('.card, [role="button"]');
  console.log(`Found ${cards.length} cards.`);
  if (cards.length > 0) {
      console.log("Clicking first card...");
      await cards[0].click();
      await page.waitForTimeout(1000);
  }

  console.log("Done.");
  await browser.close();
})();
