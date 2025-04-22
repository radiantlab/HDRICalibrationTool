import NumberInput from "./number-input";
import DeriveViewSettings from "./derive-view-settings";
import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { Extensions, Directories } from "./string_functions";
import { readDir } from '@tauri-apps/api/fs';
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";
import { useConfigStore } from "../stores/config-store";
import { useSettingsStore } from "../stores/settings-store";

export default function CroppingResizingViewSettings() {
  const { viewSettings, devicePaths, setConfig } = useConfigStore();
  const { settings } = useSettingsStore();

  const handleViewSettingsChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConfig({
      viewSettings: {
        ...viewSettings,
        [event.currentTarget.name]: event.currentTarget.value,
      },
    });
  };

  const valid_extensions = [
    "jpg", "jpeg", "3fr", "ari", "arw", "bay", "braw", "crw", "cr2", "cr3", "cap", "data",
    "dcs", "dcr", "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef",
    "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d", "raf", "raw", "rwl",
    "rw2", "rwz", "sr2", "srf", "srw", "tif", "tiff", "x3f",
  ];
  
  // toggle on/off for image derivation view
  const [active, setActive] = useState<boolean>(false);
  // selected image
  const [asset, setAsset] = useState<any>("");

  let selected: any | any[] = [];

  async function dialog() {
    if (devicePaths.length == 0) {
      alert("Please complete the Image Selection section before proceeding.");
      return;
    }
    
    setActive(false);

    // Get path to folder containing images. If input is directory, use said directory. 
    let imgsLoc = "";
    if (valid_extensions.includes(Extensions(devicePaths[0]).toLocaleLowerCase())) {
      imgsLoc = Directories(devicePaths[0]);
    } else imgsLoc = devicePaths[0];

    selected = await open({
      defaultPath: imgsLoc,
      filters: [{
        name: 'Image',
        extensions: valid_extensions,
      }],
    });

    if (selected !== null) {
      if (!valid_extensions.includes(Extensions(selected).toLowerCase())) {
        alert("Invalid file type. Please only enter valid image types: jpg, jpeg, tif, tiff, or raw image formats.");
        return;
      }

      // Check that image is one of selected images
      let match = false;
      for (let i = 0; i < devicePaths.length; i++) {
        let ext = Extensions(devicePaths[i]).toLowerCase();
        if (!valid_extensions.includes(ext)) {
          let contents = await readDir(devicePaths[i]);
          for (let j = 0; j < contents.length; j++) {
            if (contents[j].path == selected) {
              match = true;
              break;
            }
          }
        } else {
          if (devicePaths[i] == selected) match = true;
        }
        if (match) break;
      }

      if (!match) {
        alert("Could not match selected file to provided LDR images.");
        return;
      }

      // Check if raw image is selected 
      let ext = Extensions(selected).toLowerCase();
      let tst: any[] = [selected];
      if (ext !== "jpeg" && ext !== "jpg" && ext !== "tif" && ext !== "tiff") {
        const tiff: any = await invoke<string>("convert_raw_img", {dcraw: settings.dcrawEmuPath, pths: tst,});
        setAsset(convertFileSrc(tiff[0]));
      } else setAsset(convertFileSrc(selected));

      setActive(true);
    }
  }

  return (
    <div className="">
      <h2 className="font-bold pt-5">Cropping, Resizing, and View Settings</h2>
      <div className="flex flex-row space-x-5 pt-5">
        <div>Derive From Image (Optional)</div>
        <button
          onClick={dialog}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded h-fit"
        >
          Select Image
        </button>
      </div>
      {active && (
        <div>
          <DeriveViewSettings 
            setActive={setActive}
            asset={asset}
          />
        </div>
      )}
      <div>
        <div className="flex flex-row space-x-5 pt-5">
          <NumberInput
            name="diameter"
            value={viewSettings.diameter}
            label="Fisheye View Diameter"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
        </div>
        <div>
          <NumberInput
            name="xleft"
            value={viewSettings.xleft}
            label="X Left Offset (distance between left edge of the image and left edge of fisheye view)"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
          <NumberInput
            name="ydown"
            value={viewSettings.ydown}
            label="Y Bottom Offset (distance between bottom edge of the image and bottom edge of fisheye view)"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
        </div>
        <div className="flex flex-row space-x-5">
          <NumberInput
            name="vv"
            value={viewSettings.vv}
            label="View Vertical (vv)"
            placeholder="degrees"
            handleChange={handleViewSettingsChange}
          />
          <NumberInput
            name="vh"
            value={viewSettings.vh}
            label="View Horizontal (vh)"
            placeholder="degrees"
            handleChange={handleViewSettingsChange}
          />
        </div>
        <div>
          <NumberInput
            name="targetRes"
            value={viewSettings.targetRes}
            label="Target Width/Height (resizing)"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
        </div>
      </div>
    </div>
  );
}
