import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DateTime } from "luxon";
import { mkdir } from "node:fs/promises";
test("caller booking, owner dashboard, mobile and accessibility", async ({
  page,
}) => {
  await page.goto("/call/juniper");
  await page.getByLabel("Your name", { exact: true }).fill("Avery Demo");
  await page.getByLabel("Demo phone identifier").fill("demo-e2e");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(
    page.getByText("This is an automated assistant", { exact: false }),
  ).toBeVisible();
  const date = DateTime.now().plus({ weeks: 5 }).startOf("week").toISODate();
  await page
    .getByLabel("Your message", { exact: true })
    .fill(`Book a haircut on ${date} at 11:00`);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Please confirm Haircut", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Your message", { exact: true }).fill("yes");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Confirmed: Haircut", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/img/caller-mobile.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(
    (token) => sessionStorage.setItem("ringback-owner", token),
    process.env.ADMIN_TOKEN!,
  );
  await page.goto("/owner/juniper");
  await expect(
    page.getByRole("heading", { name: "Good things are calling." }),
  ).toBeVisible();
  await expect(page.getByText("Avery Demo").first()).toBeVisible();
  const seeded = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/owner/juniper/demo") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add demo activity" }).click();
  expect((await seeded).ok()).toBe(true);
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "CALLS HANDLED" })
      .locator("strong"),
  ).toHaveText("6");
  await page.screenshot({ path: "docs/img/dashboard.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await expect(page.getByText(/booking-/).first()).toBeVisible();
  await page.screenshot({ path: "docs/img/calendar.png", fullPage: true });
  await page.getByRole("button", { name: "Durability & evidence" }).click();
  await page.screenshot({ path: "docs/img/evidence.png", fullPage: true });
});
test("owner onboarding review and immediate test call", async ({ page }) => {
  await page.addInitScript(
    (token) => sessionStorage.setItem("ringback-owner", token),
    process.env.ADMIN_TOKEN!,
  );
  await page.goto("/onboard");
  await page
    .getByLabel("Tell us about your business")
    .fill("A fictional salon with haircuts for £35, Monday to Friday.");
  await page.getByRole("button", { name: "Create my draft" }).click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Demo Birch Studio");
  await page.getByLabel("Service name", { exact: true }).fill("Consultation");
  await page.getByLabel("Price (£)", { exact: true }).fill("35");
  await page.getByText("More business details", { exact: true }).click();
  await page.getByLabel("Languages (comma separated)").fill("");
  await page
    .getByLabel("Languages (comma separated)")
    .pressSequentially("en, hi");
  await expect(page.getByLabel("Languages (comma separated)")).toHaveValue(
    "en, hi",
  );
  await page.getByLabel("Buffer between appointments (minutes)").fill("15");
  await page
    .getByLabel("Escalation contact", { exact: true })
    .fill("Fictional owner inbox");
  await page.screenshot({ path: "docs/img/onboarding.png", fullPage: true });
  await page
    .getByLabel("Answer 1", { exact: false })
    .fill("This is a fictional studio for testing.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save & try a call" }).click();
  await expect(
    page.getByRole("heading", { name: "Demo Birch Studio" }),
  ).toBeVisible();
  const configs = await (await page.request.get("/api/businesses")).json();
  expect(
    configs.find((b: any) => b.name === "Demo Birch Studio").languages,
  ).toEqual(["en", "hi"]);
});
test("home, dark theme and keyboard focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Ringback home" })).toBeFocused();
  await page.screenshot({ path: "docs/img/home.png", fullPage: true });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/img", { recursive: true });
  await page.screenshot({ path: "docs/img/home-dark.png", fullPage: true });
});
