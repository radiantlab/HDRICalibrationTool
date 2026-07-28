"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** What a pre-run dialog has to say. */
export interface RunConfirmation {
  setCount: number;
  unsupplied: string[];
}

/**
 * Decides whether there is anything to ask before a run starts, and what.
 *
 * Two things are worth confirming and neither is worth its own prompt:
 * answering two dialogs to start one run is worse than reading two paragraphs
 * in one. Null means go straight to the pipeline.
 */
export function describeRunConfirmation(
  setCount: number,
  unsupplied: string[]
): RunConfirmation | null {
  if (setCount > 1 || unsupplied.length > 0) {
    return { setCount, unsupplied };
  }
  return null;
}

// #183 settled this phrasing. It avoids calling the files "missing": the user
// may well have meant to leave them out, and telling someone they forgot
// something they did on purpose reads as a bug in the app rather than a
// question. Kept as constants so the batch variant reuses the exact words
// rather than a paraphrase of them.
const CALIBRATION_TITLE = "Not all calibration files have been uploaded";
const CALIBRATION_QUESTION =
  "Did you mean to not upload them all, or do you want to go back?";

/**
 * Asks whatever needs asking before a run starts.
 *
 * `confirmation` doubles as the open flag. The dialog has no opinion on when it
 * should be shown, and a caller with nothing to ask about has nothing to pass.
 */
export function RunConfirmDialog({
  confirmation,
  onDecision,
}: {
  confirmation: RunConfirmation | null;
  onDecision: (proceed: boolean) => void;
}) {
  const setCount = confirmation ? confirmation.setCount : 1;
  const unsupplied = confirmation ? confirmation.unsupplied : [];
  const batch = setCount > 1;
  const incomplete = unsupplied.length > 0;
  const title = batch ? `Generate ${setCount} HDR images?` : CALIBRATION_TITLE;
  const description = batch
    ? `The same settings on this page are applied to all ${setCount} sets.`
    : CALIBRATION_QUESTION;

  return (
    <Dialog
      // Escape and the overlay both close the dialog. Neither is an
      // instruction to run the pipeline, so both mean go back.
      onOpenChange={(open) => {
        if (!open) {
          onDecision(false);
        }
      }}
      open={confirmation !== null}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {batch ? (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
            <li>Lens mask position and radius</li>
            <li>Fisheye view angles and projection</li>
            <li>Target resolution</li>
            <li>Calibration files</li>
          </ul>
        ) : null}

        {incomplete ? (
          <div className="space-y-2">
            {/* Repeated in full for a batch, where the title is about the
                sets rather than the files. */}
            {batch ? (
              <p className="font-medium text-sm">
                {`${CALIBRATION_TITLE}. ${CALIBRATION_QUESTION}`}
              </p>
            ) : null}
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
              {unsupplied.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              The pipeline skips the stage each of these would have driven, so
              the output will not be corrected for them.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={() => onDecision(false)} variant="outline">
            Go back
          </Button>
          <Button onClick={() => onDecision(true)}>
            {batch ? "Generate all" : "Generate anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
