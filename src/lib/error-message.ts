/**
 * A message for anything a boundary caught.
 *
 * react-error-boundary 6.1 widened `error` to `unknown`, which is more honest:
 * `throw` accepts any value, and a rejected promise carrying a string is
 * common enough. Reading `.message` off it was only ever safe by convention.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : String(error);
}
