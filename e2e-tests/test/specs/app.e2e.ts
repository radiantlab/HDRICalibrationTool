import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { $, browser } from "@wdio/globals";
import { describe, it } from "mocha";

const E2E_DROP_EVENT = "__hdricalibrationtool_e2e_drop__";
const jpegInputDirectory = fileURLToPath(
	new URL("../inputs/JPEG", import.meta.url)
);

describe("HDRI Calibration Tool", () => {
	it("opens to the home page", async () => {
		await browser.waitUntil(
			async () => (await browser.getUrl()).endsWith("/home-page"),
			{
				timeout: 10000,
				timeoutMsg: "expected the app to load to the home page",
			},
		);
	});

	it("accepts image file drops in the image input component", async () => {
		const imageInput = await $("#image-matrix-input");
		await imageInput.waitForDisplayed({ timeout: 5000 });

		await browser.execute(
			(eventName, detail) => {
				window.dispatchEvent(new CustomEvent(eventName, { detail }));
			},
			E2E_DROP_EVENT,
			{
				targetId: "image-matrix-input",
				paths: [jpegInputDirectory],
			}
		);

		await browser.waitUntil(
			async () =>
				await browser.execute(() => document.body.innerText.includes("JPEG")),
			{
				timeout: 10000,
				timeoutMsg: "expected the dropped JPEG input set to appear",
			}
		);

		assert.equal(
			await browser.execute(() => document.body.innerText.includes("JPEG")),
			true
		);
	});
});
