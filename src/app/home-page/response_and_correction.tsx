import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/api/dialog";
import { Paths, Extensions } from "./string_functions";
import { useConfigStore } from "../stores/config-store";
import FileFieldRow from "./file-field-row";

export default function Response_and_correction() {
  const {
    fe_correctionPaths,
    v_correctionPaths,
    nd_correctionPaths,
    cf_correctionPaths,
    setConfig,
  } = useConfigStore();

  const set_fe_correctionPaths = (fe_correction: string) => {
    setConfig({ fe_correctionPaths: fe_correction });
  };
  const set_v_correctionPaths = (v_correction: string) => {
    setConfig({ v_correctionPaths: v_correction });
  };
  const set_nd_correctionPaths = (nd_correction: string) => {
    setConfig({ nd_correctionPaths: nd_correction });
  };
  const set_cf_correctionPaths = (cf_correction: string) => {
    setConfig({ cf_correctionPaths: cf_correction });
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
        set_fe_correctionPaths(fe_correction[0]);
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
        set_v_correctionPaths(v_correction[0]);
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
        set_nd_correctionPaths(nd_correction[0]);
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
        set_cf_correctionPaths(cf_correction[0]);
      }
    }
    if (DEBUG) {
      console.log("cf_correction: ", cf_correction);
    }
  }

  const handle_fe_delete = () => {
    set_fe_correctionPaths("");
  };

  const handle_v_delete = () => {
    set_v_correctionPaths("");
  };

  const handle_nd_delete = () => {
    set_nd_correctionPaths("");
  };

  const handle_cf_delete = () => {
    set_cf_correctionPaths("");
  };
  return (
    <div className="space-y-6">
      <FileFieldRow
        label="Fish Eye Correction"
        value={fe_correctionPaths}
        onBrowse={dialogFE}
        onClear={handle_fe_delete}
        onEdit={() => console.log("Edit fish eye")}
        errorMessage={fe_error ? "Please only enter files ending in .cal" : ""}
      />

      <FileFieldRow
        label="Vignetting Correction"
        value={v_correctionPaths}
        onBrowse={dialogV}
        onClear={handle_v_delete}
        onEdit={() => console.log("Edit vignetting")}
        errorMessage={v_error ? "Please only enter files ending in .cal" : ""}
      />

      <FileFieldRow
        label="Neutral Density Correction"
        value={nd_correctionPaths}
        onBrowse={dialogND}
        onClear={handle_nd_delete}
        onEdit={() => console.log("Edit neutral density")}
        errorMessage={nd_error ? "Please only enter files ending in .cal" : ""}
      />

      <FileFieldRow
        label="Calibration Factor Correction"
        value={cf_correctionPaths}
        onBrowse={dialogCF}
        onClear={handle_cf_delete}
        onEdit={() => console.log("Edit calibration")}
        errorMessage={cf_error ? "Please only enter files ending in .cal" : ""}
      />
    </div>
  );
}
