export default function Page() {
  return (
    <div>
      <div>
        <h1>Settings</h1>
      </div>
      <div>
        <div className=" w-full border-y-2 border-gray-900 px-8 pt-6 pb-8 m-10">
          <h2 className="pr-5 mb-10 border-b-gray-900 border w-fit pb-2 text-2xl">
            External Utilities Settings
          </h2>
          <div>
            <div className="flex flex-row space-x-5">
              {/* <div className="mb-4"> */}
              {/* <label className="block mb-2">{label}</label> */}
              <label className="block mb-2">Radiance Path (binary)</label>
              <input
                // onChange={handleChange}
                // name={name}
                type="text"
                // placeholder={placeholder}
                // defaultValue={defaultValue}
                defaultValue="/usr/local/radiance/bin"
                className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
              {/* </div> */}
            </div>
            <div className="flex flex-row space-x-5">
              {/* <div className="mb-4"> */}
              {/* <label className="block mb-2">{label}</label> */}
              <label className="block mb-2">hdrgen Path</label>
              <input
                // onChange={handleChange}
                // name={name}
                type="text"
                // placeholder={placeholder}
                // defaultValue={defaultValue}
                defaultValue="/usr/local/bin"
                className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
              {/* </div> */}
            </div>
            <div className="flex flex-row space-x-5">
              {/* <div className="mb-4"> */}
              {/* <label className="block mb-2">{label}</label> */}
              <label className="block mb-2">Output Path</label>
              <input
                // onChange={handleChange}
                // name={name}
                type="text"
                // placeholder={placeholder}
                // defaultValue={defaultValue}
                defaultValue="/home/hdri-app"
                className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
              {/* </div> */}
            </div>
            <div className="flex flex-row space-x-5">
              {/* <div className="mb-4"> */}
              {/* <label className="block mb-2">{label}</label> */}
              <label className="block mb-2">Temp Path (debug only)</label>
              <input
                // onChange={handleChange}
                // name={name}
                type="text"
                // placeholder={placeholder}
                // defaultValue={defaultValue}
                defaultValue="/tmp"
                className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
              {/* </div> */}
            </div>
          </div>
        </div>
        <div>
          <h1>App Settings</h1>
        </div>
      </div>
    </div>
  );
}

// <div className=" w-full border-y-2 border-gray-900 px-8 pt-6 pb-8 m-10">
//       <h2 className="pr-5 mb-10 border-b-gray-900 border w-fit pb-2 text-2xl">Cropping, Resizing, and View Settings</h2>
//       <div>
//         <div className="flex flex-row space-x-5">
//           <NumberInput
//             name="xres"
//             label="Width (X resolution)"
//             placeholder="pixels"
//             handleChange={handleChange}
//           />
//           <NumberInput
//             name="yres"
//             label="Height (Y resolution)"
//             placeholder="pixels"
//             handleChange={handleChange}
//           />
//           <NumberInput
//             name="diameter"
//             label="Fisheye View Diameter"
//             placeholder="pixels"
//             handleChange={handleChange}
//           />
//         </div>
