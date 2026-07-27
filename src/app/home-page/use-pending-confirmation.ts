import { useCallback, useRef, useState } from "react";

/**
 * Lets a submit handler stop and await an answer from a dialog.
 *
 * `ask` returns a promise the handler can await; `subject` drives whatever the
 * dialog needs to render, and doubles as its open flag. `decide` settles the
 * promise and closes the dialog.
 *
 * The resolver lives in a ref rather than in state for two reasons. It makes
 * `decide` stable, so it does not change identity on every render of whatever
 * dialog holds it. And it makes `decide` idempotent: the ref is cleared before
 * the promise is settled, so a second call does nothing. That matters because
 * closing a controlled dialog fires its dismiss handler, which calls `decide`
 * again immediately after a button already did.
 */
export function usePendingConfirmation<T>() {
  const resolveRef = useRef<((proceed: boolean) => void) | null>(null);
  const [subject, setSubject] = useState<T | null>(null);

  const ask = useCallback(
    (next: T) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setSubject(next);
      }),
    []
  );

  const decide = useCallback((proceed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setSubject(null);
    resolve?.(proceed);
  }, []);

  return { ask, decide, subject };
}
