import React, { useEffect, useRef, useState } from "react";
import { useConfigStore } from "../stores/config-store";
import * as THREE from 'three';

export default function DeriveViewSettings({
    setActive,
    asset,
}: any) {
    const { viewSettings, setConfig } = useConfigStore();
    // Original image dimensions
    const [ogSize, setOgSize] = useState<any>([0,0]);
    // Scaled image dimensions
    const [scaledSize, setScaledSize] = useState<any>([0,0]);

    const canv = useRef<HTMLCanvasElement | null>(null);
    const ctx = useRef<CanvasRenderingContext2D | null>(null);
    const renderer = useRef<THREE.WebGLRenderer>();
    const mousePos = useRef({
        posX: 0,
        posY: 0,
    });
    const texture = useRef<THREE.CanvasTexture>();

    const [scene, setScene] = useState<THREE.Scene>();
    const [cam, setCam] = useState<THREE.OrthographicCamera>();
    
    const loader = new THREE.TextureLoader();
    const [ogim, setOgim] = useState<any>(); // ogImg

    let w: number, h: number;

    /**
     * Class for interactive circle to fit around fisheye lens of selected image. 
     */
    class Lens {
        x: number;
        y: number;
        radius: number;
        isMoving: boolean;
        isResizing: boolean;

        constructor(x: number, y: number, radius: number) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.isMoving = false;
            this.isResizing = false;
        }

        draw() {
            
            if (ctx.current && ogim) {
                // Main circle
                ctx.current.drawImage(ogim, 0, 0, scaledSize[0], scaledSize[1]);
                ctx.current.beginPath();
                ctx.current.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.current.strokeStyle = 'red';
                ctx.current.lineWidth = 2;
                ctx.current.stroke();
                // Cross hair
                ctx.current.beginPath();
                ctx.current.moveTo(this.x + 8, this.y);
                ctx.current.lineTo(this.x - 8, this.y);
                ctx.current.lineWidth = 3;
                ctx.current.stroke();
                ctx.current.beginPath();
                ctx.current.moveTo(this.x, this.y + 8);
                ctx.current.lineTo(this.x, this.y - 8);
                ctx.current.lineWidth = 3;
                ctx.current.stroke();
                // Resize handel
                ctx.current.beginPath();
                ctx.current.arc(this.x + this.radius, this.y, 6, 0, 2 * Math.PI);
                ctx.current.strokeStyle = 'dark blue'
                ctx.current.fillStyle = 'blue';
                ctx.current.fill();
            }
        }

        isInLens(px: number, py: number) {
            const rx = px - this.x;
            const ry = py - this.y;
            return Math.sqrt(rx ** 2 + ry ** 2) <= this.radius;
        }

        isOnHandle(px: number, py: number) {
            const handleX = this.x + this.radius;
            const dx = px - handleX;
            const dy = py - this.y;
            return Math.sqrt(dx ** 2 + dy ** 2) <= 6;
        }
    };

    const [lens, setLens] = useState<Lens>();

    // Canvas setup
    useEffect(() => {
        if (canv.current) {
            const cont = canv.current.getContext('2d');
            if (cont) ctx.current = cont;
            loader.load(asset, (imgTexture) => {
                const img = imgTexture.image;
                setOgim(img);
                setOgSize([img.width, img.height]);

                // Scale image down to fit window if necessary
                w = img.width, h = img.height;
                while (w > 900) {
                    w *= 0.75;
                    h *= 0.75;
                }
                setScaledSize([w, h]);
                if (canv.current) {
                    canv.current.width = w;
                    canv.current.height = h;
                }
                const curLens = new Lens(55, 55, 50);
                curLens.draw();
                setLens(curLens);
            });
            renderer.current = new THREE.WebGLRenderer();
            renderer.current.setSize(window.innerWidth, window.innerHeight);
        }
    }, [canv.current]);

    // Setup scene and camera
    useEffect(() => {
        if (canv.current && renderer.current) {
            texture.current = new THREE.CanvasTexture(canv.current);
            const geo = new THREE.PlaneGeometry(w, h);
            const mat = new THREE.MeshBasicMaterial({map: texture.current, transparent: true});
            const plane = new THREE.Mesh(geo, mat);

            const scn = new THREE.Scene();
            scn.add(plane);
            setScene(scn);

            const camr = new THREE.OrthographicCamera(
                window.innerWidth / -2,
                window.innerWidth / 2,
                window.innerHeight / 2,
                window.innerHeight / -2,
                1,
                1000
            );
            camr.position.z = 5;
            setCam(camr)
        }
    }, [canv.current]);

    //Interactive event handlers
    useEffect(() => {
        if (canv.current) {
            const mouseDown = (ev: MouseEvent) => {
                if (lens && canv.current) {
                    mousePos.current = {
                        posX: ev.clientX - canv.current.offsetLeft,
                        posY: ev.clientY - (canv.current.offsetTop - window.scrollY),
                    };
                    if (lens.isOnHandle(mousePos.current.posX, mousePos.current.posY)) {
                        lens.isResizing = true;
                    }
                    else if (lens.isInLens(mousePos.current.posX, mousePos.current.posY)) {
                        lens.isMoving = true;
                    }
                }
            };
    
            const mouseMove = (ev: MouseEvent) => {
                if (canv.current && lens && texture.current) {
                    mousePos.current = {
                        posX: ev.clientX - canv.current.offsetLeft,
                        posY: ev.clientY - (canv.current.offsetTop - window.scrollY),
                    };
                    if (lens.isMoving) {
                        lens.x = mousePos.current.posX;
                        lens.y = mousePos.current.posY;
                        lens.draw();
                        texture.current.needsUpdate = true;
                    }
                    else if (lens.isResizing) {
                        let dx = lens.x - mousePos.current.posX;
                        let dy = lens.y - mousePos.current.posY;
                        lens.radius = Math.max(10, Math.sqrt(dx**2 + dy**2));
                        lens.draw();
                        texture.current.needsUpdate;
                    }
                }
            };
    
            const mouseUp = (ev: MouseEvent) => {
                if (lens && canv.current) {
                    lens.isMoving = false;
                    lens.isResizing = false;
                    mousePos.current = {
                        posX: ev.clientX - canv.current.offsetLeft,
                        posY: ev.clientY - (canv.current.offsetTop - window.scrollY),
                    };
                }
            }

            canv.current.onmousedown = mouseDown;
            canv.current.onmousemove = mouseMove;
            canv.current.onmouseup = mouseUp;
        }
    }, [canv.current, lens, texture.current])

    // Handle window resize event
    useEffect(() => {
        const resized = () => {
            if (renderer.current && cam) {
                cam.top = window.innerHeight / 2;
                cam.bottom = window.innerHeight / -2;
                cam.right = window.innerWidth / 2;
                cam.left = window.innerWidth / -2;
                cam.updateProjectionMatrix();

                renderer.current.setSize(window.innerWidth, window.innerHeight);
            }
        }
        window.addEventListener('resize', resized);
        return () => {
            window.removeEventListener('resize', resized);
        };
    }, [renderer.current, cam]);

    // Three.js animate
    useEffect(() => {
        if (renderer.current && scene && cam) {
            const animate = () => {
                if (scene && cam) {
                    renderer.current?.render(scene, cam);
                    window.requestAnimationFrame(animate);
                }
            };
            animate();
        }
    }, [renderer.current, scene, cam]);

    function handleOnCancel() {
        setActive(false);
    };

    // Update view settings with derived values
    function handleOnDone() {
        if (lens && canv.current) {
            // Image did not need to be scaled down
            let diam = lens.radius * 2;
            let xOffset = lens.x - lens.radius;
            let yOffset = canv.current.height - (lens.y + lens.radius);

            // Image was scaled down
            if (canv.current.width != ogSize[0]) {
                // Calculate ratios for scaling
                let curArea = Math.PI * lens.radius ** 2;
                let scaledArea = (ogSize[0] * ogSize[1]) * curArea / (canv.current.width * canv.current.height);
                diam = Math.floor(Math.sqrt(scaledArea / Math.PI)) * 2;

                xOffset = Math.floor(ogSize[0] * xOffset / canv.current.width);
                yOffset = Math.floor(ogSize[1] * yOffset / canv.current.height);
            }

            setConfig({
                viewSettings: {
                    diameter: diam + '',
                    xleft: xOffset + '',
                    ydown: yOffset + '',
                    vv: viewSettings.vv,
                    vh: viewSettings.vh,
                    targetRes: viewSettings.targetRes,
                },
            });
        }
    };

    return (
        <div className="py-2">
            <canvas ref={canv}></canvas>
            <div className="flex flex-row space-x-5 pt-5">
                <button
                    onClick={handleOnDone} 
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded h-fit"
                >
                    Done
                </button>
                <button
                    onClick={handleOnCancel}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded h-fit"
                >
                    Cancel
                </button>
            </div>
        </div>
    )
}