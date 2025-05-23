import React, { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Paths, Extensions } from "../string_functions";
import { useConfigStore } from "../../stores/config-store";
import { FileEditor } from "./file_editor"; 
import { EditingFileType } from "@/app/global-types";
import FileFieldRow from "../file-field-row";

export default function Response_and_correction() {
  const {
    responsePaths,
    fe_correctionPaths,
    v_correctionPaths,
    nd_correctionPaths,
    cf_correctionPaths,
    setConfig,
  } = useConfigStore();

  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [currentEditingFile, setCurrentEditingFile] = useState<string>("");
  const [editingFileType, setEditingFileType] = useState<EditingFileType>(EditingFileType.NONE);

  const openEditor = (filePath: string, fileType: EditingFileType) => {
    setCurrentEditingFile(filePath);
    setIsEditorOpen(true);
    setEditingFileType(fileType);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
  };

  const DEBUG = true;
  let fe_correction: any = "";
  let v_correction: any = "";
  let nd_correction: any = "";
  let cf_correction: any = "";
  // Error checking display
  const [fe_error, set_fe_error] = useState<boolean>(false);
  const [v_error, set_v_error] = useState<boolean>(false);
  const [nd_error, set_nd_error] = useState<boolean>(false);
  const [cf_error, set_cf_error] = useState<boolean>(false);

  async function dialogFE() {
    fe_correction = await open({
      multiple: true,
    });
    if (fe_correction === null) {
      // user cancelled the selection
    } else {
      console.log(fe_correction[0]);
      set_fe_error(false);
      if (Extensions(fe_correction[0]) !== "cal") {
        set_fe_error(true);
      } else {
        setConfig({ fe_correctionPaths: fe_correction[0] });
      }
    }
    if (DEBUG) {
      console.log("fe_correction: ", fe_correction);
    }
  }

  async function dialogV() {
    v_correction = await open({
      multiple: true,
    });
    if (v_correction === null) {
      // user cancelled the selection
    } else {
      set_v_error(false);
      if (Extensions(v_correction[0]) !== "cal") {
        set_v_error(true);
      } else {
        setConfig({ v_correctionPaths: v_correction[0] });
      }
    }
    if (DEBUG) {
      console.log("v_correction: ", v_correction);
    }
  }

  async function dialogND() {
    nd_correction = await open({
      multiple: true,
    });
    if (nd_correction === null) {
      // user cancelled the selection
    } else {
      set_nd_error(false);
      if (Extensions(nd_correction[0]) !== "cal") {
        set_nd_error(true);
      } else {
        setConfig({ nd_correctionPaths: nd_correction[0] });
      }
    }
    if (DEBUG) {
      console.log("nd_correction: ", nd_correction);
    }
  }

  async function dialogCF() {
    cf_correction = await open({
      multiple: true,
    });
    if (cf_correction === null) {
      // user cancelled the selection
    } else {
      set_cf_error(false);
      if (Extensions(cf_correction[0]) !== "cal") {
        set_cf_error(true);
      } else {
        setConfig({ cf_correctionPaths: cf_correction[0] });
      }
    }
    if (DEBUG) {
      console.log("cf_correction: ", cf_correction);
    }
  }

  const handleResponseDelete = () => {
    setConfig({ responsePaths: "" });
  };

  const handle_fe_delete = () => {
    setConfig({ fe_correctionPaths: "" });
  };

  const handle_v_delete = () => {
    setConfig({ v_correctionPaths: "" });
  };

  const handle_nd_delete = () => {
    setConfig({ nd_correctionPaths: "" });
  };

  const handle_cf_delete = () => {
    setConfig({ cf_correctionPaths: "" });
  };
  return (
    <div>
      <h2 className="font-bold pt-5" id="fe">
        Fish Eye Correction
      </h2>
      <FileFieldRow
        label="Fish Eye Correction"
        value={fe_correctionPaths}
        onBrowse={dialogFE}
        onClear={handle_fe_delete}
        onEdit={() => openEditor(fe_correctionPaths, EditingFileType.FISH_EYE)}
        errorMessage={fe_error ? "Please only enter files ending in cal" : ""}
      />

      <h2 className="font-bold pt-5" id="v">
        Vignetting Correction
      </h2>
      <FileFieldRow
        label="Vignetting Correction"
        value={v_correctionPaths}
        onBrowse={dialogV}
        onClear={handle_v_delete}
        onEdit={() => openEditor(v_correctionPaths, EditingFileType.VIGNETTING)}
        errorMessage={v_error ? "Please only enter files ending in cal" : ""}
      />

      <h2 className="font-bold pt-5" id="nd">
        Neutral Density Correction
      </h2>
      <FileFieldRow
        label="Neutral Density Correction"
        value={nd_correctionPaths}
        onBrowse={dialogND}
        onClear={handle_nd_delete}
        onEdit={() => openEditor(nd_correctionPaths, EditingFileType.NEUTRAL_DENSITY)}
        errorMessage={nd_error ? "Please only enter files ending in cal" : ""}
      />

      <h2 className="font-bold pt-5" id="cf">
        Calibration Factor Correction
      </h2>
      <FileFieldRow
        label="Calibration Factor Correction"
        value={cf_correctionPaths}
        onBrowse={dialogCF}
        onClear={handle_cf_delete}
        onEdit={() => openEditor(cf_correctionPaths, EditingFileType.CALIBRATION_FACTOR)}
        errorMessage={cf_error ? "Please only enter files ending in cal" : ""}
      />
      <div className="pt-5"></div>

      <FileEditor 
        filePath={currentEditingFile} 
        isOpen={isEditorOpen} 
        closeEditor={closeEditor}
        editingFileType={editingFileType}
      />
    </div>
  );
}
