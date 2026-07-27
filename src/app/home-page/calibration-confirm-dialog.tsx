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

/**
 * Asks whether an incomplete set of calibration files was deliberate.
 *
 * The wording avoids calling the files "missing": the user may well have meant
 * to leave them out, and telling someone they forgot something they did on
 * purpose reads as a bug in the app rather than a question.
 *
 * `unsupplied` doubles as the open flag. The dialog has no opinion on when it
 * should be shown, and a caller that has nothing to ask about has nothing to
 * pass.
 */
export function CalibrationConfirmDialog({
  onDecision,
  unsupplied,
}: {
  onDecision: (proceed: boolean) => void;
  unsupplied: string[] | null;
}) {
  return (
    <Dialog
      // Escape and the overlay both close the dialog. Neither is an
      // instruction to run the pipeline, so both mean go back.
      onOpenChange={(open) => {
        if (!open) {
          onDecision(false);
        }
      }}
      open={unsupplied !== null}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Not all calibration files have been uploaded
          </DialogTitle>
          <DialogDescription>
            Did you mean to not upload them all, or do you want to go back?
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
          {unsupplied?.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>

        <p className="text-muted-foreground text-xs">
          The pipeline skips the stage each of these would have driven, so the
          output will not be corrected for them.
        </p>

        <DialogFooter>
          <Button onClick={() => onDecision(false)} variant="outline">
            Go back
          </Button>
          <Button onClick={() => onDecision(true)}>Generate anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
