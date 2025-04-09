import React, { useState, useEffect } from "react";
import Link from "next/link";
import { open } from "@tauri-apps/api/dialog";
import { Paths, Extensions } from "./string_functions";
import { useConfigStore } from "../stores/config-store";
import { WebviewWindow } from "@tauri-apps/api/window";

export default function Response_and_correction() {
  const {
    responsePaths,
    fe_correctionPaths,
    v_correctionPaths,
    nd_correctionPaths,
    cf_correctionPaths,
    setConfig,
  } = useConfigStore();

  const setResponsePaths = (response: string) => {
    setConfig({ responsePaths: response });
  };
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
  let response: any = "";
  let fe_correction: any = "";
  let v_correction: any = "";
  let nd_correction: any = "";
  let cf_correction: any = "";
  // Error checking display
  const [response_error, set_response_error] = useState<boolean>(false);
  const [fe_error, set_fe_error] = useState<boolean>(false);
  const [v_error, set_v_error] = useState<boolean>(false);
  const [nd_error, set_nd_error] = useState<boolean>(false);
  const [cf_error, set_cf_error] = useState<boolean>(false);
  async function dialogResponse() {
    response = await open({
      multiple: true,
    });
    if (response === null) {
      // user cancelled the selection
    } else {
      console.log("Extension " + Extensions(response[0]));
      set_response_error(false);
      if (Extensions(response[0]) !== "rsp") {
        set_response_error(true);
      } else {
        setResponsePaths(response[0]);
      }
    }
    if (DEBUG) {
      console.log("response: ", response);
    }
  }

  // async function webviewTest() {
  //   const newWindow = new WebviewWindow("my-empty-window", {
  //     title: "Edit Response File",
  //     url: "/editor-page"
  //     // url: "C:/Users/s1221/Desktop/College/2024-2025/Term_3/CS463/Repo/HDRICalibrationTool/src/app/home-page/test.html",
  //   });
  // }

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

  const handleResponseDelete = () => {
    setResponsePaths("");
  };

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
    <div>
      <h2 className="font-bold pt-5" id="response">
        Response File
      </h2>
      <button
        onClick={dialogResponse}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
      >
        Select File
      </button>
      { responsePaths && <Link href={ {pathname: "/editor-page", query: { filepath: responsePaths }}}>
        <button
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Edit File
        </button>
      </Link> }
      <div>
        {response_error && (
          <div>
            <p>Please only enter files ending in rsp</p>
          </div>
        )}
        {responsePaths && (
          <div>
            {Paths(responsePaths)}{" "}
            <button onClick={() => handleResponseDelete()}>Delete</button>
          </div>
        )}
      </div>
      <h2 className="font-bold pt-5" id="fe">
        Fish Eye Correction
      </h2>
      <button
        onClick={dialogFE}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
      >
        Select File
      </button>
      <div>
        {fe_error && (
          <div>
            <p>Please only enter files ending in cal</p>
          </div>
        )}
        {fe_correctionPaths && (
          <div>
            {Paths(fe_correctionPaths)}{" "}
            <button onClick={() => handle_fe_delete()}>Delete</button>
          </div>
        )}
      </div>
      <h2 className="font-bold pt-5" id="v">
        Vignetting Correction
      </h2>
      <button
        onClick={dialogV}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
      >
        Select File
      </button>
      <div>
        {v_error && (
          <div>
            <p>Please only enter files ending in cal</p>
          </div>
        )}
        {v_correctionPaths && (
          <div>
            {Paths(v_correctionPaths)}{" "}
            <button onClick={() => handle_v_delete()}>Delete</button>
          </div>
        )}
      </div>
      <h2 className="font-bold pt-5" id="nd">
        Neutral Density Correction
      </h2>
      <button
        onClick={dialogND}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
      >
        Select File
      </button>
      <div>
        {nd_error && (
          <div>
            <p>Please only enter files ending in cal</p>
          </div>
        )}
        {nd_correctionPaths && (
          <div>
            {Paths(nd_correctionPaths)}{" "}
            <button onClick={() => handle_nd_delete()}>Delete</button>
          </div>
        )}
      </div>
      <h2 className="font-bold pt-5" id="cf">
        Calibration Factor Correction
      </h2>
      <button
        onClick={dialogCF}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
      >
        Select File
      </button>
      <div>
        {cf_error && (
          <div>
            <p>Please only enter files ending in cal</p>
          </div>
        )}
        {cf_correctionPaths && (
          <div>
            {Paths(cf_correctionPaths)}{" "}
            <button onClick={() => handle_cf_delete()}>Delete</button>
          </div>
        )}
        <div className="pt-5"></div>
      </div>
    </div>
  );
}
