mod nullify_exposure_value;

use nullify_exposure_value::nullify_exposure_value;

// Used to print out debug information
pub const DEBUG: bool = true;

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
) -> Result<String, String> {
    if DEBUG {
        println!("Pipeline module called...");
        println!("\tradiance path: {radiance_path}");
        println!("\thdrgen path: {hdrgen_path}");
        println!("\toutput path: {output_path}");
        println!("\ttemp path: {temp_path}");
    }

    // Add path to radiance and temp directory info to config settings
    let config_settings = ConfigSettings {
        radiance_path: radiance_path,
        // _hdrgen_path: hdrgen_path,
        // _output_path: output_path,
        temp_path: temp_path,
    };

    // Currently just run nullify_exposure_value and directly return result
    return nullify_exposure_value(
        &config_settings,
        format!("{}output1.hdr", config_settings.temp_path),
        format!("{}output2.hdr", config_settings.temp_path),
    );
}
