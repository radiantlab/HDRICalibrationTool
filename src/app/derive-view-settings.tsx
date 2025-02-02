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
    // for scaling derived values to match original image proportions
    const [ogSize, setOgSize] = useState<any>([]);
    // asset path to selected image
    const [selected, setSelected] = useState<any>('');
    // list of images for display
    const [images, setImages] = useState<File[]>([]);
    // toggle on/off for image selection view
    const[select, setSelect] = useState<boolean>(false);

    let list: any | any[] = [];

    /**
     * Retrive files/directories the user selected from the Image Selection
     * of the application. Set 'select' to true.  
     */
    async function listImages() {
        list = [];

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

        // if list is empty (directory/directories contained no valid images)
        // (temporary - plan to implement more checks in images)
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
        // since img element already has a set width & height, the image has to be loaded
        // separately in order to get its original dimensions
        const image = new Image();
        image.onload = () => {
            setOgSize([image.width, image.height]); 
            setSelected(im);
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
        const hold = document.getElementById('hold');
        if (lens && hold) {
            lens.onmousemove = handleResizeDrag; hold.onmousemove = handleResizeDrag;
            lens.onmouseup = handleResizeUp; hold.onmouseup = handleResizeUp;
        }
    }

    /**
     * onmouseup event handler for resizing the lens measurement div. 
     */
    function handleResizeUp() {
        const lens = document.getElementById('lens');
        const hold = document.getElementById('hold');
        if (lens && hold) {
            lens.onmousemove = null; hold.onmousemove = null;
            lens.onmouseup = null; hold.onmouseup = null;
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

            let amnt = Math.abs(left - xp) + Math.abs(top - yp);
            let diam = Number(lens.style.height.slice(0, lens.style.height.indexOf('p')));

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
        const image = document.getElementById('derive-img');
        if (lens && image) {
            let l_rect = lens.getBoundingClientRect(), i_rect = image.getBoundingClientRect();
            let xOffset = Math.abs(l_rect.left - i_rect.left);
            let yOffset = Math.abs(i_rect.bottom - l_rect.bottom);
            let diam = l_rect.height;

            // if image was scaled down/up
            if (i_rect.height > ogSize[1] || i_rect.height < ogSize[1]) {
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
        setActive(false);
    }

    return (
        <div>
            <h3>Derive From Image (Optional)</h3>
            <button
                onClick={listImages}
                className=""
            >
                Select Image
            </button>
            <div>
                {select && (
                    <div className="">
                        {images.map((im: any) => (
                            <div>
                                <img
                                    src={String(im)}
                                    alt=""
                                    width={100}
                                    height={100}
                                />
                                <button
                                    onClick={() => onSelected(String(im))}
                                    className=""
                                >
                                    Select
                                </button>
                            </div>
                        ))}
                        <button onClick={() => {setSelect(false)}}>Cancel</button>
                    </div>
                )}
            </div>
            <div>
                {active && (
                    <div className="flex flex-col space-x-5 pt-5">
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
                                    cursor: 'move',
                                }}
                                // className="w-[100px] h-[100px] rounded-[50%] border-4 border-red-500 flex justify-center align-center cursor-move absolute"
                                id="lens"
                                onMouseDown={handleResizeDown}
                            >
                                <div
                                    style={{fontSize: '20pt', color: 'red', textAlign: 'center', cursor: 'grab'}}
                                    // className="text-[16pt] text-center text-red-500 cursor-grab"
                                    id="mover"
                                    onMouseDown={handleMoveDown}
                                >
                                    +
                                </div>
                            </div>
                            <img src={selected} alt="" id="derive-img" width={800} height={800}/>
                        </div>
                        <div className="flex flex-row space-x-5 pt-5">
                            <button
                                onClick={() => {setActive(false)}}
                                className=""
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDone}
                                className=""
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}