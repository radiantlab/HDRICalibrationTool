import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { Extensions } from "./string_functions";
import { readDir } from '@tauri-apps/api/fs';

const DEBUG = true;

export default function DeriveViewSettings({
    viewSettings,
    setViewSettings,
    devicePaths,
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
    // list of images for display
    const [images, setImages] = useState<File[]>([]);
    // toggle on/off for image selection view
    const[select, setSelect] = useState<boolean>(false);
    
    const [check, setCheck] = useState<any>('');

    /**
     * Retrive files/directories the user selected from the Image Selection
     * of the application. Set 'select' to true.  
     */
    async function listImages() {
        let list: any[] = [];

        // ensure devicePaths not empty before proceeding 
        if (devicePaths.length < 1) {
            alert("You must complete the Image Selection section in order to proceed.");
            return;
        }

        for (let i = 0; i < devicePaths.length; i++) {
            let devExt = Extensions(devicePaths[i]).toLowerCase();

            // if image file
            if (valid_extensions.includes(devExt)) {
                list.push(convertFileSrc(devicePaths[i]));
            }
            // if directory
            else {
                const contents = await readDir(devicePaths[i]);
                for (let j = 0; j < contents.length; j++) {
                    let ext = Extensions(contents[j].path).toLowerCase();
                    // Only push if valid image type 
                    if (valid_extensions.includes(ext)) {
                        list.push(convertFileSrc(contents[j].path));
                    }
                }
            }
        }

        // if list is empty 
        if (list.length < 1) {
            alert("Unable to retrieve images.");
            return;
        }

        setImages(images.concat(list));
        setSelect(true);
    }

    /**
     * Function for image select click event. Activate interactive value derivation 
     * with target image. 
     * @param im selected image file
     */
    function onSelected(im: string) {
        // check that there isn't currently and image on display
        const c = document.querySelector('canvas');
        if (c) document.getElementById('hold')?.removeChild(c);

        // using canvas instead of img will help prevent possible stretching/warping
        const canv = document.createElement('canvas');
        const ctx = canv.getContext('2d');

        const image = new Image();
        image.onload = () => {
            setOgSize([image.width, image.height]); 
            let w = image.width, h = image.height;

            // scale image down
            if (w > 720 || h > 720) {
                while (w > 720) {
                    w *= 0.80;
                    h *= 0.80;
                }
                while (h > 720) {
                    w *= 0.80;
                    h *= 0.80;
                }
            }
            
            canv.width = w;
            canv.height = h;
            ctx?.drawImage(image, 0, 0, w, h);

            document.getElementById('hold')?.appendChild(canv);
        }
        image.src = im;
        setActive(true);
    }

    let left = 0, top = 0, xp = 0, yp = 0;
    let center: any[] = [0, 0];

    /**
     * onmousedown event handler for moving the lens measurement div. 
     * @param ev MouseEvent
     */
    function handleMoveDown(ev: any) {
        ev.preventDefault();
        xp = ev.clientX;
        yp = ev.clientY;
        const mover = document.getElementById('mover');
        if (mover) {
            mover.style.cursor = 'grabbing';
            mover.onmousemove = handleMoveDrag; 
            mover.onmouseup = handleMoveUp;
            window.onmouseup = handleMoveUp;
        }
    }

    /**
     * onmouseup event handler for moving the lens measurement div. 
     * @param ev MouseEvent
     */
    function handleMoveUp(ev: MouseEvent) {
        center[0] = ev.clientX;
        center[1] = ev.clientY;
        const mover = document.getElementById('mover');
        if (mover) {
            mover.style.cursor = 'grab';
            mover.onmousemove = null;
            mover.onmouseup = null;
            window.onmouseup = null;
        }
    }

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
            lens.style.left = (lens.offsetLeft - left) + 'px'; 
            lens.style.top = (lens.offsetTop - top) + 'px'; 
        }
    }

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
        if (lens) {
            lens.onmousemove = handleResizeDrag; window.onmousemove = handleResizeDrag;
            lens.onmouseup = handleResizeUp; window.onmouseup = handleResizeUp;
        }
    }

    /**
     * onmouseup event handler for resizing the lens measurement div. 
     */
    function handleResizeUp() {
        const lens = document.getElementById('lens');
        const hold = document.getElementById('hold');
        if (lens && hold) {
            lens.onmousemove = null; window.onmousemove = null;
            lens.onmouseup = null; window.onmouseup = null;
        }
    }

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
            // get distances from cur position to lens center and prev position to lens center
            let dist1 = Math.abs(center[0] - left) + Math.abs(center[1] - top);
            let dist2 = Math.abs(center[0] - xp) + Math.abs(center[1] - yp);
            
            let diam = Number(lens.style.height.slice(0, lens.style.height.indexOf('p')));
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

    /**
     * Ends interactive value derivation and calculates final outputs for the lens diameter,
     * xleft offset, and ydown offset. 
     */
    function handleDone() {
        const lens = document.getElementById('lens');
        const canv = document.querySelector('canvas');
        if (lens && canv) {
            let l_rect = lens.getBoundingClientRect(), i_rect = canv.getBoundingClientRect();
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
    }

    function handleCancel() {
        setActive(false);
        const canv = document.querySelector('canvas');
        if (canv) document.getElementById('hold')?.removeChild(canv);
    }

    return (
        <div>
            <button 
                onClick={listImages}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-1 px-2 border-2 border-gray-600 rounded h-fit my-[10px]"
            >
                Derive From Image (Optional)
            </button>
            {select && (
                <div className="space-x-5">
                    <div className="flex flex-wrap">
                        {images.map((im: any) => (
                            <div className="m-[5px]">
                                <img
                                    src={String(im)}
                                    alt=""
                                    width={100}
                                    height={100}
                                />
                                <div
                                    onClick={() => onSelected(String(im))}
                                    className="text-center cursor-pointer"
                                >
                                    Select
                                </div>
                            </div>
                        ))}
                    </div>
                    <button 
                        onClick={() => {setSelect(false)}}
                        className="font-semibold bg-gray-200 hover:bg-gray-300 py-1 px-2 text-gray-800 border-2 border-gray-500 rounded h-fit my-[10px]"
                    >
                        Cancel
                    </button>
                </div>
            )}
            {active && (
                <div className="flex flex-col space-x-5">
                    <div id="hold">
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
                                style={{fontSize: '14pt', color: 'red', textAlign: 'center', cursor: 'grab'}}
                                id="mover"
                                onMouseDown={handleMoveDown}
                            >
                                +
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-row space-x-5 pt-5">
                        <button
                            onClick={handleCancel}
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