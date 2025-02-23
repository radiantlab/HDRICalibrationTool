import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { Extensions } from "./string_functions";
import { readDir } from '@tauri-apps/api/fs';
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";

const DEBUG = true;

export default function DeriveViewSettings({
    viewSettings,
    setViewSettings,
    devicePaths,
    dcrawEmuPath,
}: any) {
    const valid_extensions = [
        "jpg", "jpeg", "3fr", "ari", "arw", "bay", "braw", "crw", "cr2", "cr3", "cap", "data",
        "dcs", "dcr", "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef",
        "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d", "raf", "raw", "rwl",
        "rw2", "rwz", "sr2", "srf", "srw", "tif", "tiff", "x3f",
    ];

    // toggle on/off for image derivation view
    const [active, setActive] = useState<boolean>(false);
    // original image dimensions
    const [ogSize, setOgSize] = useState<any>([]);
    // asset path for selected image
    const [asset, setAsset] = useState<any>('');
    
    const [check, setCheck] = useState<any>('');

    let selected: any | any[] = [];

    /**
     * Dialog function to allow user to select an imgage to derive certain view setting values. If
     * file selected is not in image set, display warning but allow for user to continue if desired. 
     */
    async function dialog() {
        selected = await open({
            multiple: false,
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

            let match = false;
            for (let i = 0; i < devicePaths.length; i++) {
                let ext = Extensions(devicePaths[0]).toLowerCase();
                if (!valid_extensions.includes(ext)) {
                    let contents = await readDir(devicePaths[i]);
                    for (let j = 0; j < contents.length; j++) {
                        if (contents[j].path == selected) {
                            match = true;
                            break;
                        }
                    }
                } else {
                    if (devicePaths[i] == selected) {
                        match = true;
                    }
                }
                if (match) {
                    break;
                }
            }

            if (!match) {
                // let proceed = await confirm("Could not match file to selected images. Using an image from a different set will" +
                //     " result in the wrong derived values. Continue anway?"
                // );
                // if (!proceed) return;
                alert("Could not match selected file to provided LDR images.");
                return;
            }

            let ext = Extensions(selected).toLowerCase();
            let tst: any[] = [selected];
            if (ext !== "jpeg" && ext !== "jpg" && ext !== "tif" && ext !== "tiff") {
                const tiff: any = await invoke<string>("convert_raw_img", {dcraw: dcrawEmuPath, pths: tst,});
                onSelected(convertFileSrc(tiff[0]));
            } else onSelected(convertFileSrc(selected));
        }
    }

    /**
     * Function for image select click event. Activate interactive value derivation 
     * with target image. 
     * @param im selected image file
     */
    function onSelected(im: string) {
        setAsset(im);

        const image = new Image();
        image.onload = () => {
            setOgSize([image.width, image.height]); 
        }
        image.src = im;
        setActive(true);
    };

    let left = 0, top = 0, xp = 0, yp = 0;
    let center: any[] = [0, 0];
    const [bounds, setBounds] = useState<any[]>([]);

    function checkBounds(l: any, t: any) {
        const lens = document.getElementById('lens');
        if (lens) {
            const rec = lens.getBoundingClientRect();
            let lft = rec.left - l;
            let right = rec.right - l;
            let tp = rec.top - t;
            let bottom = rec.bottom - t;

            if (bounds[0] <= lft && bounds[1] >= right && 
                bounds[2] <= tp && bounds[3] >= bottom
            ) {
                return true;
            }
        }
        return false;
    }

    function checkResizeBounds() {
        const lens = document.getElementById('lens');
        if (lens) {
            const rec = lens.getBoundingClientRect();
            
            if ((bounds[0] < rec.left) && (bounds[1] > rec.right) && 
                (bounds[2] < rec.top)  && (bounds[3] > rec.bottom)
            ) {
                return true;
            }
        }
        return false;
    };

    /**
     * onmousedown event handler for moving the lens measurement div. 
     * @param ev MouseEvent
     */
    function handleMoveDown(ev: any) {
        ev.preventDefault();
        xp = ev.clientX;
        yp = ev.clientY;
        const mover = document.getElementById('mover');
        const lens = document.getElementById('lens');

        const ig_elm = document.getElementById('img');
        if (mover && ig_elm && lens) {
            const rec = ig_elm.getBoundingClientRect();
            setBounds([rec.left, rec.right, rec.top, rec.bottom, rec.width, rec.height]);
            mover.style.cursor = 'grabbing';
            mover.onmousemove = handleMoveDrag; 
            mover.onmouseup = handleMoveUp;
            window.onmousemove = handleMoveDrag;
            window.onmouseup = handleMoveUp;
        }
    };

    /**
     * onmouseup event handler for moving the lens measurement div. 
     * @param ev MouseEvent
     */
    function handleMoveUp(ev: MouseEvent) {
        center[0] = ev.clientX;
        center[1] = ev.clientY;
        const mover = document.getElementById('mover');
        const lens = document.getElementById('lens');
        if (mover && lens) {
            mover.style.cursor = 'grab';
            mover.onmousemove = null;
            mover.onmouseup = null;
            window.onmousemove = null;
            window.onmouseup = null;
        }
    };

    /**
     * onmousemove event handler for moving the lens measurement div.
     * @param ev MouseEvent
     */
    function handleMoveDrag(ev: MouseEvent) {
        ev.preventDefault();
        left = xp - ev.clientX;
        top = yp - ev.clientY;
        xp = ev.clientX;
        yp = ev.clientY;
        const lens = document.getElementById('lens');
        if (lens) { 
            if (checkBounds(left, top)) {
                lens.style.left = (lens.offsetLeft - left) + 'px';
                lens.style.top = (lens.offsetTop - top) + 'px';
            }
        }
    };

    /**
     * onmousedown event handler for resizing the lens measurment div. 
     * @param ev MouseEvent
     */
    function handleResizeDown(ev: any) {
        ev.preventDefault();
        // if resized before moved, base center off current position
        if (center[0] == 0 && center[1] == 0) {
            center[0] = ev.clientX;
            center[1] = ev.clientY;
        }
        xp = ev.clientX;
        yp = ev.clientY;
        const lens = document.getElementById('lens'); 
        const ig_elm = document.getElementById('img');
        if (lens && ig_elm) {
            const rec = ig_elm.getBoundingClientRect();
            setBounds([rec.left, rec.right, rec.top, rec.bottom]);
            lens.onmousemove = handleResizeDrag; 
            window.onmousemove = handleResizeDrag;
            lens.onmouseup = handleResizeUp; 
            window.onmouseup = handleResizeUp;
        }
    };

    /**
     * onmouseup event handler for resizing the lens measurement div. 
     */
    function handleResizeUp() {
        const lens = document.getElementById('lens');
        if (lens) {
            lens.onmousemove = null; 
            window.onmousemove = null;
            lens.onmouseup = null; 
            window.onmouseup = null;
        }
    };

    /**
     * onmousemove event handler for resizing lens measurement div.
     * @param ev MouseEvent
     */
    function handleResizeDrag(ev: MouseEvent) {
        ev.preventDefault();
        left = xp;
        top = yp;
        xp = ev.clientX;
        yp = ev.clientY;
        const lens = document.getElementById('lens');
        if (lens) {
            if (checkResizeBounds()) {
                let diam = Number(lens.style.height.slice(0, lens.style.height.indexOf('p')));
                
                let l_cent = lens.offsetLeft + diam/2;
                let t_cent = lens.offsetTop + diam/2;

                // get distances from cur position to lens center and prev position to lens center
                let dist1 = Math.abs(l_cent - left) + Math.abs(t_cent - top);
                let dist2 = Math.abs(l_cent - xp) + Math.abs(t_cent - yp);
                
                let amnt = Math.abs(left - xp) + Math.abs(top - yp);

                // if prev farther from center - shrink lens size
                if (dist1 > dist2) {
                    lens.style.width = (diam - amnt) + 'px'; lens.style.height = (diam - amnt) + 'px';
                }
                // else increase lens size
                else {
                    lens.style.width = (diam + amnt) + 'px'; lens.style.height = (diam + amnt) + 'px';
                }

                lens.style.left = (lens.offsetLeft - (left - xp)) + 'px';
                lens.style.top = (lens.offsetTop - (top - yp)) + 'px';
            }
        }
    };

    /**
     * Ends interactive value derivation and calculates final outputs for the lens diameter,
     * xleft offset, and ydown offset. 
     */
    function handleDone() {
        const lens = document.getElementById('lens');
        const ig_elm = document.getElementById('img');
        if (lens && ig_elm) {
            let l_rect = lens.getBoundingClientRect(), i_rect = ig_elm.getBoundingClientRect();
            let xOffset = Math.abs(l_rect.left - i_rect.left);
            let yOffset = Math.abs(i_rect.bottom - l_rect.bottom);
            let diam = l_rect.height;

            // if image was scaled down/up
            if (i_rect.height != ogSize[1]) {
                // scale diameter based on area of lens to area of image ratio
                let curArea = Math.PI * (diam/2)**2;
                let scaledArea = (ogSize[0] * ogSize[1]) * curArea / (i_rect.height * i_rect.width);
                diam = Math.sqrt(scaledArea / Math.PI) * 2;

                // scale x and y offsets based on their ratios to the width and length of image respectively 
                let x = xOffset, y = yOffset;
                xOffset = ogSize[0] * x / i_rect.width;
                yOffset = ogSize[1] * y / i_rect.height;
            }

            const updatedView = {
                diameter: Math.floor(diam) + '',
                xleft: Math.floor(xOffset) + '',
                ydown: Math.floor(yOffset) + '',
                vv: viewSettings.vv,
                vh: viewSettings.vh,
                targetRes: viewSettings.targetRes,
            };
            setViewSettings(updatedView);
        }
    };

    function handleReset() {
        const lens = document.getElementById('lens');
        if (lens) {
            lens.style.width = '100px';
            lens.style.height = '100px';
            lens.style.left = bounds[0] + 'px';
            lens.style.top = bounds[2] + 'px';
        }
    }

    return (
        <div>
            <button 
                onClick={dialog}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-1 px-2 border-2 border-gray-600 rounded h-fit my-[10px]"
            >
                Derive From Image (Optional)
            </button>
            {active && (
                <div className="flex flex-col space-x-5">
                    <div id="hold" className="">
                        <div
                            style={{
                                border: 'solid red',
                                width: '100px',
                                height: '100px',
                                borderRadius: '50%',
                                position: 'absolute',
                                alignItems: 'center',
                                justifyContent: 'center',
                                display: 'flex',
                                cursor: 'move'
                            }}
                            id="lens"
                            onMouseDown={handleResizeDown}
                        >
                            <div
                                style={{fontSize: '16pt', color: 'red', textAlign: 'center', cursor: 'grab'}}
                                id="mover"
                                onMouseDown={handleMoveDown}
                            >
                                +
                            </div>
                        </div>
                        <img src={asset} alt="" id="img" width={650} height={650} />
                    </div>
                    <div className="flex flex-row justify-center item-center space-x-5 pt-5">
                        <button
                            onClick={handleReset}
                            className="font-semibold bg-gray-200 hover:bg-gray-300 py-1 px-2 text-gray-900 border-2 border-gray-500 rounded h-fit me-[14px] my-[5px]"
                        >
                            Reset
                        </button>
                        <button
                            onClick={() => {setActive(false)}}
                            className="font-semibold bg-gray-200 hover:bg-gray-300 py-1 px-2 text-gray-900 border-2 border-gray-500 rounded h-fit me-[14px] my-[5px]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDone}
                            className="font-semibold bg-gray-200 hover:bg-gray-300 py-1 px-2 text-gray-900 border-2 border-gray-500 rounded h-fit me-[14px] my-[5px]"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}