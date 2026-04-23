import assert from "node:assert/strict";

describe("HDRI Calibration Tool", () => {
  it("loads the application shell", async () => {
    await browser.waitUntil(
      async () => (await browser.getTitle()) === "HDRI Calibration Tool",
      {
        timeout: 10000,
        timeoutMsg: "expected the app title to load",
      }
    );

    assert.equal(await browser.getTitle(), "HDRI Calibration Tool");
  });

  it("shows the primary action on the home page", async () => {
    const generateButton = await $(
      '//button[contains(normalize-space(.), "Generate HDR Image")]'
    );

    await generateButton.waitForDisplayed({ timeout: 10000 });
    assert.equal(await generateButton.getText(), "Generate HDR Image");
  });
});
