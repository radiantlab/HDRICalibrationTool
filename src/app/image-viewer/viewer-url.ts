"use client";

import { createSerializer, parseAsString } from "nuqs";

export const serializeViewerUrl = createSerializer({
  filePath: parseAsString,
});
