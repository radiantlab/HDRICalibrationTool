"use client";

import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type GenericImageMetadata,
  useGenericImageMetadata,
} from "@/lib/generic-image-metadata";
import { tauriPresetIo } from "@/lib/host/preset-io";
import {
  changedSources,
  deletePreset,
  type Preset,
  type PresetFileSlot,
  presetFilePath,
  presetId,
  readPresets,
  renamePreset,
  savePreset,
} from "@/lib/presets";
import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";

/**
 * Awaiting undefined yields undefined, which keeps the possibly-absent promise
 * out of the caller as a branch. The hook is overloaded and the linter does not
 * resolve which signature applies, so an inline check reads as unnecessary.
 */
async function resolveImageSize(
  promise: Promise<GenericImageMetadata> | undefined
): Promise<[number, number] | null> {
  const metadata = await promise;
  return metadata?.size ?? null;
}

const SLOT_LABEL: Record<PresetFileSlot, string> = {
  calibrationFactor: "calibration factor",
  fisheye: "fisheye correction",
  neutralDensity: "ND filter",
  response: "camera response",
  vignetting: "vignetting",
};

/**
 * Saves and reapplies the equipment half of the configuration.
 *
 * Calibration files are copied into the preset when it is saved, so it survives
 * the originals moving. The cost of copying is that a re-derived calibration no
 * longer reaches the preset, which is why the source hashes are compared on load
 * and any drift is surfaced rather than silently ignored.
 */
export function PresetBar({
  form,
  maskImagePath,
}: {
  form: UseFormReturn<pipelineConfig>;
  maskImagePath: string | undefined;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [changed, setChanged] = useState<PresetFileSlot[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState("");
  const nameId = useId();
  const [maskImageSize, setMaskImageSize] = useState<[number, number] | null>(
    null
  );

  // Resolved with an effect rather than use(), so the bar does not pull the
  // whole configuration panel into a Suspense boundary.
  const metadataPromise: Promise<GenericImageMetadata> | undefined =
    useGenericImageMetadata(maskImagePath);
  useEffect(() => {
    let cancelled = false;
    resolveImageSize(metadataPromise)
      .then((size) => {
        if (!cancelled) {
          setMaskImageSize(size);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [metadataPromise]);

  const load = useCallback(async () => {
    setPresets(await readPresets());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = presets.find((preset) => preset.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setChanged([]);
      return;
    }
    changedSources(selected, tauriPresetIo).then(setChanged);
  }, [selected]);

  // Not async any more: presetFilePath is a pure derivation now that a preset
  // carries its calibration rather than pointing at a copy on disk.
  const apply = (preset: Preset) => {
    form.setValue("fisheyeView", preset.fisheyeView);
    form.setValue("outputSettings", preset.outputSettings);
    if (preset.lensMask) {
      form.setValue("lensMask", preset.lensMask);
    }
    form.setValue("cameraResponseLocation", presetFilePath(preset, "response"));
    form.setValue("correctionFiles", {
      calibrationFactor: presetFilePath(preset, "calibrationFactor"),
      fisheye: presetFilePath(preset, "fisheye"),
      neutralDensity: presetFilePath(preset, "neutralDensity"),
      vignetting: presetFilePath(preset, "vignetting"),
    });

    if (
      preset.lensMaskImageSize &&
      maskImageSize &&
      (preset.lensMaskImageSize[0] !== maskImageSize[0] ||
        preset.lensMaskImageSize[1] !== maskImageSize[1])
    ) {
      toast.warning(
        `The lens mask in this preset was drawn against a ${preset.lensMaskImageSize[0]}x${preset.lensMaskImageSize[1]} image, but the selected image is ${maskImageSize[0]}x${maskImageSize[1]}. Check the mask before running.`
      );
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const id = presetId(trimmed);
    try {
      await savePreset(
        id,
        trimmed,
        form.getValues(),
        maskImageSize,
        tauriPresetIo
      );
      await load();
      setSelectedId(id);
      setSaveOpen(false);
      toast.success(`Saved preset "${trimmed}"`);
    } catch (error) {
      toast.error(`Could not save the preset: ${error}`);
    }
  };

  const rename = async () => {
    const trimmed = name.trim();
    if (!(selected && trimmed)) {
      return;
    }
    try {
      await renamePreset(selected.id, trimmed);
      await load();
      setRenameOpen(false);
      toast.success(`Renamed to "${trimmed}"`);
    } catch (error) {
      toast.error(`Could not rename the preset: ${error}`);
    }
  };

  const remove = async () => {
    if (!selected) {
      return;
    }
    try {
      await deletePreset(selected.id);
      await load();
      setSelectedId("");
      setConfirmDelete(false);
      toast.success(`Deleted preset "${selected.name}"`);
    } catch (error) {
      toast.error(`Could not delete the preset: ${error}`);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b p-4">
      <div className="flex items-center gap-2">
        <Label className="shrink-0">Preset</Label>
        <Select
          onValueChange={(value) => {
            setSelectedId(value);
            const preset = presets.find((entry) => entry.id === value);
            if (preset) {
              apply(preset);
            }
          }}
          value={selectedId}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="No preset selected" />
          </SelectTrigger>
          <SelectContent>
            {presets.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground text-sm">
                No presets saved yet
              </p>
            ) : (
              presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          className="h-9"
          onClick={() => {
            setName(selected?.name ?? "");
            setSaveOpen(true);
          }}
          type="button"
          variant="outline"
        >
          Save
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Preset actions"
              className="h-9"
              disabled={!selected}
              type="button"
              variant="outline"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => {
                setName(selected?.name ?? "");
                setRenameOpen(true);
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmDelete(true)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {changed.length > 0 ? (
        <p className="text-amber-600 text-xs">
          The {changed.map((slot) => SLOT_LABEL[slot]).join(", ")} file
          {changed.length > 1 ? "s have" : " has"} changed on disk since this
          preset was saved. Save the preset again to pick up the new version.
        </p>
      ) : null}

      <Dialog onOpenChange={setSaveOpen} open={saveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save preset</DialogTitle>
            <DialogDescription>
              Stores the camera response, calibration files, view angles,
              projection, target resolution and lens mask. The image set and the
              measured illuminance are not saved, since they change with every
              capture.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              onChange={(event) => setName(event.target.value)}
              placeholder="Canon 5D II + Sigma 8mm, f/8"
              value={name}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setSaveOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={save} type="button">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setRenameOpen} open={renameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename preset</DialogTitle>
            <DialogDescription>
              The stored calibration files are untouched; only the name changes.
            </DialogDescription>
          </DialogHeader>
          <Input
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <DialogFooter>
            <Button
              onClick={() => setRenameOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={rename} type="button">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{selected?.name}"?</DialogTitle>
            <DialogDescription>
              This removes the preset and the copies of its calibration files.
              Your original .rsp and .cal files are not touched, and no run
              history is affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmDelete(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={remove} type="button">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
