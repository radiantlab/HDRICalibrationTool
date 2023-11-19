mod crop;
// mod resize;

use crop::crop;
// use resize::resize;

// Used to print out debug information
pub const DEBUG: bool = false;

// Struct to hold some configuration settings (e.g. path settings).
// Used when various stages of the pipeline are called.
pub struct ConfigSettings {
    radiance_path: String,
    // hdrgen_path: String,
    // output_path: String,
    temp_path: String,
}

// Runs the radiance and hdrgen pipeline.
// radiance_path:
//      The path to radiance binaries
// hdrgen_path:
//      The path to the hdrgen binary
// output_path: (NOT CURRENTLY USED)
//      Place for final HDR image to be stored
// temp_path: (CURRENTLY WHERE OUTPUTS ARE STORED)
//      Place for intermediate HDR image outputs to be stored
#[tauri::command]
pub fn pipeline(
    radiance_path: String,
    hdrgen_path: String,
    output_path: String,
    temp_path: String,
    diameter: String,
    xleft: String,
    ydown: String,
) -> Result<String, String> {
    if DEBUG {
        println!("Pipeline module called...");
        println!("\tradiance path: {radiance_path}");
        println!("\thdrgen path: {hdrgen_path}");
        println!("\toutput path: {output_path}");
        println!("\ttemp path: {temp_path}");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tydown: {ydown}");
    }

    // Add path to radiance and temp directory info to config settings
    let config_settings = ConfigSettings {
        radiance_path: radiance_path,
        // _hdrgen_path: hdrgen_path,
        // _output_path: output_path,
        temp_path: temp_path,
    };

    // Run function to crop and directly return result
    let crop_result = crop(
        &config_settings,
        format!("{}output2.hdr", config_settings.temp_path),
        format!("{}output3.hdr", config_settings.temp_path),
        diameter,
        xleft,
        ydown,
    );

    // if crop_result.is_err() {
    return crop_result;
    // }
}
