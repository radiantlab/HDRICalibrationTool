export default function Progress({Progress}: any) {
    const progress1: number = 25;
    const progress2: number = 50;
    const progress3: number = 75;
    return (
        <div className="bg-gray-300 fixed w-6/12 h-56 top-56 text-center text-xl p-10">
            <h2>Your Images Are Being Generated</h2>
            <p className="p-10">Progress {Progress}%</p>
            {Progress < progress1  && <div className="bg-black w-1">.</div>}
            {Progress < progress2  && Progress > progress1 && <div className="bg-black w-1/4">.</div>}
            {Progress < progress3  && Progress > progress2 && <div className="bg-black w-1/2">.</div>}
            {Progress > progress3  && <div className="bg-black w-1/1">.</div>}
            
        </div>
    )
}