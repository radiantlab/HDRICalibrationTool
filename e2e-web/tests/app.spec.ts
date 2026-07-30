/**
 * The web build loads, routes, and reports what it is running.
 *
 * Fast checks, no pipeline. These are the ones worth having run on every push:
 * an export that 404s at the root or ships without `versions.json` is broken
 * for everyone, and neither failure needs a bracket to detect.
 */

import { expect, test } from "@playwright/test";

test("the site root lands on the generator", async ({ page }) => {
  // A static export with no `index.html` 404s at `/`, which is the first
  // thing a visitor sees and the last thing a build log mentions.
  await page.goto("/");
  await expect(page).toHaveURL(/\/home-page/);
  await expect(
    page.getByRole("heading", { name: "HDRI Calibration Tool" })
  ).toBeVisible();
});

test("every tab is reachable by URL, not only by clicking", async ({
  page,
}) => {
  // Deep links matter more here than on the desktop: a browser user can
  // bookmark, refresh, or be sent one, and a static export only serves a
  // route it actually emitted a file for.
  for (const route of [
    "/home-page",
    "/settings-page",
    "/runs",
    "/image-viewer",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(route));
    await expect(page.locator("nav")).toBeVisible();
  }
});

test("the logo and title sit flush left, and the controls flush right", async ({
  page,
}) => {
  await page.goto("/home-page");

  const header = page.locator("#logo");
  const title = page.getByRole("heading", { name: "HDRI Calibration Tool" });
  const tutorial = page.getByRole("button", {
    name: "Luminance Maps tutorial",
  });
  // The visible one of the two theme variants.
  const mark = page.locator("#logo img:visible");

  const [group, heading, link, logo, viewport] = await Promise.all([
    header.boundingBox(),
    title.boundingBox(),
    tutorial.boundingBox(),
    mark.boundingBox(),
    page.evaluate(() => window.innerWidth),
  ]);

  if (!(group && heading && link && logo)) {
    throw new Error(
      "expected the header, title, mark and tutorial link to be laid out"
    );
  }

  // The regression this pins: the mark carries width and height attributes of
  // 512, and the class list set only `h-10`. CSS height overrode the height
  // attribute, but nothing overrode the width, so the box stayed 512px wide
  // with the mark letterboxed inside it. The logo looked correct and shoved
  // the title 524px off the left edge.
  //
  // Asserted on the image's own box, because that is what was wrong. Comparing
  // the title's left edge against the *group's* right edge would prove nothing
  // -- the title is the group's last child, so those coincide by construction
  // whatever width the image takes.
  expect(logo.width).toBeLessThan(64);
  expect(Math.abs(logo.width - logo.height)).toBeLessThan(2);

  // Both flush left: the group at the container edge, the title just past the
  // mark rather than halfway across the header.
  expect(group.x).toBeLessThan(64);
  expect(heading.x).toBeLessThan(160);

  // And the right-hand controls are actually on the right.
  expect(link.x + link.width).toBeGreaterThan(viewport - 80);
});

test("the settings page reports the bundled tool versions", async ({
  page,
}) => {
  await page.goto("/settings-page");

  // `public/wasm/versions.json` is generated at build time and is easy to
  // leave out of an export. Without it the page renders, so nothing fails --
  // it just quietly stops saying which Radiance produced your luminance map.
  const about = page.getByText(/about this build/i);
  await expect(about).toBeVisible();

  for (const tool of ["Radiance", "hdrgen", "LibRaw"]) {
    await expect(page.getByText(new RegExp(tool, "i")).first()).toBeVisible();
  }
});

test("settings scrolls to its last card", async ({ page }) => {
  // Regression: the action bar was `fixed bottom-0` and sat on top of the end
  // of the page, so the final card could not be reached at any window size.
  await page.setViewportSize({ height: 600, width: 1280 });
  await page.goto("/settings-page");

  const reachedBottom = await page.evaluate(() => {
    const scroller = Array.from(document.querySelectorAll("*")).find((el) => {
      const style = getComputedStyle(el);
      return (
        /auto|scroll/.test(style.overflowY) &&
        el.scrollHeight > el.clientHeight + 8
      );
    });
    if (!scroller) {
      // Nothing overflows at this size, so nothing can be cut off.
      return true;
    }
    scroller.scrollTop = scroller.scrollHeight;
    return (
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
    );
  });

  expect(reachedBottom).toBe(true);
});

test("dark mode can be chosen and survives a reload", async ({ page }) => {
  await page.goto("/home-page");

  const isDark = () =>
    page.evaluate(() => document.documentElement.classList.contains("dark"));

  // The control cycles light, dark and system rather than flipping, so the
  // test clicks until it arrives rather than assuming where it started. Which
  // of the three is current depends on the runner's own OS preference, and a
  // test that assumed light would pass on CI and fail on a dark laptop.
  const toggle = page.getByRole("button", { name: /^Theme:/ });
  for (let click = 0; click < 3 && !(await isDark()); click += 1) {
    await toggle.click();
  }
  expect(await isDark()).toBe(true);

  // Persisted, not merely applied: a preference that resets on every
  // navigation is worse than no preference at all, and this is a static
  // export where every route change is a fresh document.
  await page.reload();
  await expect.poll(isDark).toBe(true);

  await page.goto("/settings-page");
  await expect.poll(isDark).toBe(true);
});
