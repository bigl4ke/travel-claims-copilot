import { expect, test, type Page } from "./offline-test";

async function submit(page: Page, message: string): Promise<void> {
  await page.getByLabel("Your message").fill(message);
  await page.getByRole("button", { name: /Start|Continue/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("starts with an empty answer and the action-first guided intake", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Move the trip forward." })).toBeVisible();
  await expect(page.getByLabel("Your message")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
});

test("completes a Marriott hotel-walk analysis", async ({ page }) => {
  await submit(
    page,
    "I have a confirmed Marriott reservation booked directly, but the hotel had no room when I arrived."
  );

  await expect(page.getByText("What to do now", { exact: true })).toBeVisible();
  await expect(page.getByText("Hotel walk", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Ultimate Reservation Guarantee/ })).toBeVisible();
  await expect(page.getByText(/comparable room/i).first()).toBeVisible();
});

test("handles an unavailable airline reason without repeating the question", async ({ page }) => {
  await submit(
    page,
    "My Air France flight from Paris to New York was cancelled. I was rerouted and reached my final destination four hours late."
  );
  await expect(page.getByText("What reason did the airline give?", { exact: true })).toBeVisible();

  await submit(page, "I don't know the reason.");

  await expect(page.getByText("What to do now", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Regulation \(EC\) No 261\/2004/i })).toBeVisible();
  await expect(page.getByText("What reason did the airline give?", { exact: true })).toHaveCount(1);
});

test("keeps a Chicago to China United cancellation outside EU261", async ({ page }) => {
  await submit(
    page,
    "My United flight from Chicago to Beijing was cancelled. I am at the airport and no reason was given."
  );

  await expect(page.getByText("What to do now", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /EU261/i })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Refunds and Other Consumer Protections Final Rule/i })
  ).toBeVisible();
});

test("completes a US involuntary denied-boarding analysis", async ({ page }) => {
  await submit(
    page,
    "My American Airlines flight from JFK to LAX was oversold and I was involuntarily denied boarding."
  );
  await expect(
    page.getByText(
      "Is the trip completed, are you at the airport or already traveling, or have you not departed yet?",
      { exact: true }
    )
  ).toBeVisible();

  await submit(page, "I am at the airport.");

  await expect(page.getByText("What to do now", { exact: true })).toBeVisible();
  await expect(page.getByText("Denied boarding", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Bumping and Oversales/i })).toBeVisible();
});

test("uses a provider denial to replace the current action", async ({ page }) => {
  await submit(
    page,
    "My United flight from Chicago to Beijing was cancelled. I am at the airport and no reason was given."
  );
  await page.getByLabel("What did they say?").fill("We cannot rebook you and gave no reason.");
  await page.getByRole("button", { name: "Find my next move" }).click();

  await expect(page.getByText(/Get the denial in writing/i).first()).toBeVisible();
  await expect(page.getByText("Provider reply", { exact: true })).toBeVisible();
  await expect(
    page.getByText("We cannot rebook you and gave no reason.", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/The provider denied/i).first()).toBeVisible();
});

test("keeps the continuation input in the conversation on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await submit(
    page,
    "My United flight from Chicago to Beijing was cancelled. I am at the airport and no reason was given."
  );

  await expect(page.getByLabel("What did they say?")).toBeVisible();
  await expect(page.getByLabel("What did they say?")).toHaveCount(1);
  await expect(page.getByText("Continue here after they respond", { exact: true })).toBeVisible();
});
