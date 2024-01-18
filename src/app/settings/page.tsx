import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="w-full">
        <button className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded">
          <Link href="/">Return to Home</Link>
        </button>
      </div>

      <h1 className="text-4xl text-center mt-10">Settings</h1>
      <div>
        <div className="w-full border-t-2 border-t-gray-900 px-8 pt-6 pb-8 m-10">
          <h2 className="pr-5 mb-10 border-b-2 border-b-gray-900 w-fit pb-2 text-2xl">
            External Utilities Settings
          </h2>
          <div>
            <div className="flex flex-row space-x-5">
              <div className="mb-4">
                <label className="block mb-2">Radiance Path (binary)</label>
                <input
                  type="text"
                  defaultValue="/usr/local/radiance/bin"
                  className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                ></input>
              </div>
              <div className="mb-4">
                <label className="block mb-2">hdrgen Path</label>
                <input
                  type="text"
                  defaultValue="/usr/local/bin"
                  className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                ></input>
              </div>
              <div className="mb-4">
                <label className="block mb-2">Output Path</label>
                <input
                  type="text"
                  defaultValue="/home/hdri-app"
                  className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                ></input>
              </div>
              <div className="mb-4">
                <label className="block mb-2">Temp Path (debug only)</label>
                <input
                  type="text"
                  defaultValue="/tmp"
                  className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                ></input>
              </div>
            </div>
          </div>
        </div>
        <div className=" w-full border-t-2 border-gray-900 px-8 pt-6 pb-8 m-10">
          <h2 className="pr-5 mb-10 border-b-gray-900 border-b-2 w-fit pb-2 text-2xl">
            App Settings
          </h2>
          <div>
            <div className="flex flex-row space-x-5 items-center">
              <label className="block mb-2">Show Image Previews</label>
              <input type="checkbox" defaultChecked={true}></input>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
