import type { Page } from "@playwright/test";

/** Mobile camera/graphics controls live behind the Tools button. */
export async function openWorldTools(page: Page) {
  const tools = page.getByRole("button", { name: "World tools", exact: true });
  if (await tools.isVisible() && await tools.getAttribute("aria-expanded") !== "true") await tools.click();
}
