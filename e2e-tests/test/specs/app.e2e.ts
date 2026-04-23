import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { $, browser } from "@wdio/globals";
import { describe, it } from "mocha";

const E2E_DROP_EVENT = "__hdricalibrationtool_e2e_drop__";
const jpegInputDirectory = fileURLToPath(
	new URL("../inputs/JPEG", import.meta.url),
);
const expectedJpegFileCount = readdirSync(jpegInputDirectory).filter(
	(fileName) =>
		[".jpg", ".jpeg"].includes(path.extname(fileName).toLowerCase()),
).length;

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
			},
		);

		it("displays previews for the dropped images", async () => {
			await browser.waitUntil(
				async () => {
					const previewCount = await browser.execute(
						() =>
							document.querySelectorAll('[data-testid="image-set-preview"]')
								.length,
					);
					if (previewCount !== 1) return false;

					const previewImageCount = await browser.execute(
						() =>
							document.querySelectorAll(
								'[data-testid="image-set-preview"] .generic-image-container',
							).length,
					);
					return previewImageCount === expectedJpegFileCount;
				},
				{
					timeout: 10000,
					timeoutMsg: `expected exactly ${expectedJpegFileCount} JPEG previews to render`,
				},
			);
		});
	});

	it("generates an HDR image", async () => {
		const generateHDRImageButton = await $("#generate-hdr-image-button");
		await generateHDRImageButton.waitForDisplayed({ timeout: 1000 });
		await generateHDRImageButton.click();
	});
});
