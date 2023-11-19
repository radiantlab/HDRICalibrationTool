use crate::pipeline::DEBUG;
use std::process::Command;

use super::ConfigSettings;

pub fn crop(
    config_settings: &ConfigSettings,
    input_file: String,
    output_file: String,
    diameter: String,
    xleft: String,
    ydown: String,
) -> Result<String, String> {
    if DEBUG {
        println!("crop was called! With parameters");
        println!("\tdiameter: {diameter}");
        println!("\txleft: {xleft}");
        println!("\tydown: {ydown}");
    }

    return Err("Crop not implemented yet.".into());
}
