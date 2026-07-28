import { describe, expect, it } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import {
  type RunConfirmation,
  RunConfirmDialog,
} from "../src/app/home-page/run-confirm-dialog";
import { usePendingConfirmation } from "../src/app/home-page/use-pending-confirmation";

const GENERATE_ANYWAY = /Generate anyway/i;
const GO_BACK = /Go back/i;
const GENERATE_HDR = /Generate HDR/i;

/**
 * The repo's act idiom: a non-async callback returning a promise, so the
 * resolved render is flushed without an async function that never awaits.
 */
function flush(work: () => void) {
  return act(() => {
    work();
    return Promise.resolve();
  });
}

describe("usePendingConfirmation", () => {
  it("has nothing to show until it is asked", () => {
    const { result } = renderHook(() => usePendingConfirmation<string[]>());

    expect(result.current.subject).toBeNull();
  });

  it("surfaces the subject so the dialog can render it", async () => {
    const { result } = renderHook(() => usePendingConfirmation<string[]>());

    await flush(() => {
      result.current.ask(["Camera response"]);
    });

    expect(result.current.subject).toEqual(["Camera response"]);
  });

  it("resolves true and closes when the answer is to proceed", async () => {
    const { result } = renderHook(() => usePendingConfirmation<string[]>());

    let answer: boolean | null = null;
    await flush(() => {
      result.current.ask(["Camera response"]).then((proceed) => {
        answer = proceed;
      });
    });

    await flush(() => result.current.decide(true));

    expect(answer).toBe(true);
    expect(result.current.subject).toBeNull();
  });

  it("resolves false when the answer is to go back", async () => {
    const { result } = renderHook(() => usePendingConfirmation<string[]>());

    let answer: boolean | null = null;
    await flush(() => {
      result.current.ask(["Camera response"]).then((proceed) => {
        answer = proceed;
      });
    });

    await flush(() => result.current.decide(false));

    expect(answer).toBe(false);
  });

  // Closing a controlled dialog fires its dismiss handler, so decide is called
  // a second time immediately after a button already answered. The first
  // answer has to stand.
  it("ignores a second answer", async () => {
    const { result } = renderHook(() => usePendingConfirmation<string[]>());

    const answers: boolean[] = [];
    await flush(() => {
      result.current.ask(["Camera response"]).then((proceed) => {
        answers.push(proceed);
      });
    });

    await flush(() => {
      result.current.decide(true);
      result.current.decide(false);
    });

    expect(answers).toEqual([true]);
  });

  it("keeps decide stable so a dialog holding it does not churn", () => {
    const { result, rerender } = renderHook(() =>
      usePendingConfirmation<string[]>()
    );
    const first = result.current.decide;

    rerender();

    expect(result.current.decide).toBe(first);
  });
});

/**
 * The join the submit handler depends on: ask parks a promise, the dialog
 * renders the subject, a button settles it. Proven end to end rather than in
 * two halves that each assume the other.
 */
function ConfirmHarness({
  onAnswer,
}: {
  onAnswer: (proceed: boolean) => void;
}) {
  const { ask, decide, subject } = usePendingConfirmation<RunConfirmation>();

  return (
    <>
      <button
        onClick={async () => {
          onAnswer(
            await ask({
              setCount: 1,
              unsupplied: ["Camera response", "Vignetting correction"],
            })
          );
        }}
        type="button"
      >
        Generate HDR Image
      </button>
      <RunConfirmDialog confirmation={subject} onDecision={decide} />
    </>
  );
}

describe("the calibration confirmation round trip", () => {
  it("shows the dialog only once a run is attempted", async () => {
    render(<ConfirmHarness onAnswer={() => undefined} />);

    expect(screen.queryByRole("dialog")).toBeNull();

    await flush(() =>
      fireEvent.click(screen.getByRole("button", { name: GENERATE_HDR }))
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Vignetting correction")).toBeInTheDocument();
  });

  it("lets the run continue when the omission was deliberate", async () => {
    const answers: boolean[] = [];
    render(<ConfirmHarness onAnswer={(proceed) => answers.push(proceed)} />);

    await flush(() =>
      fireEvent.click(screen.getByRole("button", { name: GENERATE_HDR }))
    );
    await flush(() =>
      fireEvent.click(screen.getByRole("button", { name: GENERATE_ANYWAY }))
    );

    // Exactly once: the dialog closing must not answer a second time.
    expect(answers).toEqual([true]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("abandons the run when the user goes back", async () => {
    const answers: boolean[] = [];
    render(<ConfirmHarness onAnswer={(proceed) => answers.push(proceed)} />);

    await flush(() =>
      fireEvent.click(screen.getByRole("button", { name: GENERATE_HDR }))
    );
    await flush(() =>
      fireEvent.click(screen.getByRole("button", { name: GO_BACK }))
    );

    expect(answers).toEqual([false]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
