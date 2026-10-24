async function completeRegistrationIfNeeded(page) {
  if (!(await page.getByRole('heading', { name: 'Create your account', exact: true }).count())) return false;
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.getByLabel('Full name').fill('Browser Verification Candidate');
  await page.getByLabel('Email address').fill(`browser-${unique}@example.test`);
  await page.getByLabel('Password').fill('BrowserTestPass!2026');
  const response = page.waitForResponse((item) => item.url().endsWith('/auth/register') && item.status() === 201);
  await page.getByRole('button', { name: 'Create candidate account', exact: true }).click();
  await response;
  return true;
}

async function openWorkspace(page) {
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: 'Workspace', exact: true }).click();
  await completeRegistrationIfNeeded(page);
  await page.getByRole('button', { name: 'New interview', exact: true }).waitFor();
}

module.exports = { completeRegistrationIfNeeded, openWorkspace };
