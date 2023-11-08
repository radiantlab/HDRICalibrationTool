'use client'

import React, { useState, ChangeEvent } from 'react';

export default function Home() {
    const [images, setImages] = useState<File[]>([]);
  
    const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
      const selectedImages = Array.from(e.target.files as FileList);
      setImages(images.concat(selectedImages));
    };
  
    const handleImageDelete = (index: number) => {
      const updatedImages = images.slice();
      updatedImages.splice(index, 1);
      setImages(updatedImages);
    };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h1>HDRICalibrationTool</h1>
      <div>
        <h2>Image Upload</h2>
        <input type="file" accept="image/*" multiple onChange={handleImageSelect} />

        <div className="image-preview">
          {images.map((image, index) => (
            <div key={index} className="image-item">
              <img src={URL.createObjectURL(image)} alt={`Image ${index}`} />
              <button onClick={() => handleImageDelete(index)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

