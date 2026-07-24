use std::{
    fs::{self},
    path::{Path, PathBuf},
    sync::OnceLock,
};

use ffmpeg_next as ffmpeg;
use ffmpeg::{
    codec, encoder, format, frame, media,
    software::scaling::{context::Context as ScalingContext, flag::Flags as ScalingFlags},
    Dictionary, Packet, Rational,
};

use super::cache::{compute_hash_for_file, get_cache_dir};

const AVIF_CONTEXT_BASE: &str =
    "ffmpeg_next|container=avif|codec=av1|lossless=1|crf=0|still-picture=1";

#[cfg(target_endian = "little")]
const PREFERRED_OUTPUT_FORMATS: [format::Pixel; 9] = [
    format::Pixel::YUV444P16LE,
    format::Pixel::YUV444P12LE,
    format::Pixel::YUV444P10LE,
    format::Pixel::GBRP12LE,
    format::Pixel::GBRP10LE,
    format::Pixel::YUV444P,
    format::Pixel::YUV420P16LE,
    format::Pixel::YUV420P10LE,
    format::Pixel::YUV420P,
];

#[cfg(target_endian = "big")]
const PREFERRED_OUTPUT_FORMATS: [format::Pixel; 9] = [
    format::Pixel::YUV444P16BE,
    format::Pixel::YUV444P12BE,
    format::Pixel::YUV444P10BE,
    format::Pixel::GBRP12BE,
    format::Pixel::GBRP10BE,
    format::Pixel::YUV444P,
    format::Pixel::YUV420P16BE,
    format::Pixel::YUV420P10BE,
    format::Pixel::YUV420P,
];

static FFMPEG_INIT: OnceLock<Result<(), String>> = OnceLock::new();

fn ensure_ffmpeg_initialized() -> Result<(), String> {
    FFMPEG_INIT
        .get_or_init(|| {
            ffmpeg::init().map_err(|error| format!("Failed to initialize FFmpeg: {error}"))
        })
        .clone()
}

fn avif_context() -> String {
    format!(
        "{}|ffmpeg_config={}",
        AVIF_CONTEXT_BASE,
        format::configuration()
    )
}

fn choose_av1_encoder() -> Result<ffmpeg::Codec, String> {
    if let Some(codec) = encoder::find_by_name("libaom-av1") {
        return Ok(codec);
    }

    if let Some(codec) = encoder::find(codec::Id::AV1) {
        return Ok(codec);
    }

    Err(
        "No AV1 encoder found in this FFmpeg build; cannot convert HDR files to AVIF losslessly."
            .to_string(),
    )
}

fn choose_output_pixel_format(codec: ffmpeg::Codec) -> Result<format::Pixel, String> {
    let video_codec = codec
        .video()
        .map_err(|error| format!("Selected AV1 encoder is not a video encoder: {error}"))?;
    let supported_formats_iter = video_codec
        .formats()
        .ok_or_else(|| "Unable to query supported AV1 pixel formats.".to_string())?;
    let supported_formats: Vec<format::Pixel> = supported_formats_iter.collect();

    if supported_formats.is_empty() {
        return Err("AV1 encoder reported zero supported pixel formats.".to_string());
    }

    for preferred in PREFERRED_OUTPUT_FORMATS {
        if supported_formats.contains(&preferred) {
            return Ok(preferred);
        }
    }

    Ok(supported_formats[0])
}

fn decode_first_video_frame(
    input_context: &mut format::context::Input,
    stream_index: usize,
    decoder: &mut ffmpeg::decoder::Video,
) -> Result<frame::Video, String> {
    let mut decoded_frame = frame::Video::empty();

    for (stream, packet) in input_context.packets() {
        if stream.index() != stream_index {
            continue;
        }

        decoder
            .send_packet(&packet)
            .map_err(|error| format!("Failed to send packet to decoder: {error}"))?;

        loop {
            match decoder.receive_frame(&mut decoded_frame) {
                Ok(()) => return Ok(decoded_frame),
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => break,
                Err(ffmpeg::Error::Eof) => break,
                Err(error) => return Err(format!("Failed to decode HDR frame: {error}")),
            }
        }
    }

    decoder
        .send_eof()
        .map_err(|error| format!("Failed to flush decoder: {error}"))?;

    loop {
        match decoder.receive_frame(&mut decoded_frame) {
            Ok(()) => return Ok(decoded_frame),
            Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => break,
            Err(ffmpeg::Error::Eof) => break,
            Err(error) => return Err(format!("Failed while draining decoder: {error}")),
        }
    }

    Err("No decodable frame found in HDR input.".to_string())
}

fn convert_frame_to_encoder_format(
    decoded_frame: &frame::Video,
    output_format: format::Pixel,
) -> Result<frame::Video, String> {
    if decoded_frame.format() == output_format {
        return Ok(decoded_frame.clone());
    }

    let mut scaling_context = ScalingContext::get(
        decoded_frame.format(),
        decoded_frame.width(),
        decoded_frame.height(),
        output_format,
        decoded_frame.width(),
        decoded_frame.height(),
        ScalingFlags::LANCZOS | ScalingFlags::ACCURATE_RND,
    )
    .map_err(|error| format!("Failed to create scaling context for AVIF conversion: {error}"))?;

    let mut converted_frame = frame::Video::empty();
    scaling_context
        .run(decoded_frame, &mut converted_frame)
        .map_err(|error| format!("Failed to convert frame into AV1 encoder format: {error}"))?;
    converted_frame.set_color_space(decoded_frame.color_space());
    converted_frame.set_color_range(decoded_frame.color_range());
    converted_frame.set_color_primaries(decoded_frame.color_primaries());
    converted_frame.set_color_transfer_characteristic(decoded_frame.color_transfer_characteristic());

    Ok(converted_frame)
}

fn run_hdr_to_avif_conversion(input: &Path, output: &Path) -> Result<(), String> {
    ensure_ffmpeg_initialized()?;

    let mut input_context = format::input(input)
        .map_err(|error| format!("Failed to open input HDR image '{}': {error}", input.display()))?;
    let input_stream = input_context
        .streams()
        .best(media::Type::Video)
        .ok_or_else(|| "Input HDR image does not contain a readable video stream.".to_string())?;
    let input_stream_index = input_stream.index();
    let input_stream_time_base = input_stream.time_base();
    let input_stream_parameters = input_stream.parameters();
    let mut decoder = codec::context::Context::from_parameters(input_stream_parameters)
        .map_err(|error| format!("Failed to create decoder context from HDR input: {error}"))?
        .decoder()
        .video()
        .map_err(|error| format!("Failed to open HDR decoder: {error}"))?;
    decoder.set_packet_time_base(input_stream_time_base);

    let decoded_frame = decode_first_video_frame(&mut input_context, input_stream_index, &mut decoder)?;

    let encoder_codec = choose_av1_encoder()?;
    let encoder_name = encoder_codec.name().to_string();
    let output_pixel_format = choose_output_pixel_format(encoder_codec)?;

    let mut output_context = format::output_as(output, "avif").map_err(|error| {
        format!(
            "Failed to create AVIF output '{}': {error}. This FFmpeg build may not include the AVIF muxer.",
            output.display()
        )
    })?;

    let global_header = output_context
        .format()
        .flags()
        .contains(format::Flags::GLOBAL_HEADER);

    let mut output_stream = output_context
        .add_stream(encoder_codec)
        .map_err(|error| format!("Failed to add AV1 stream to AVIF container: {error}"))?;
    let mut video_encoder = codec::context::Context::new_with_codec(encoder_codec)
        .encoder()
        .video()
        .map_err(|error| format!("Failed to create AV1 encoder context: {error}"))?;

    output_stream.set_parameters(&video_encoder);
    video_encoder.set_width(decoded_frame.width());
    video_encoder.set_height(decoded_frame.height());
    video_encoder.set_aspect_ratio(decoded_frame.aspect_ratio());
    video_encoder.set_format(output_pixel_format);
    video_encoder.set_time_base(Rational(1, 1));
    video_encoder.set_frame_rate(Some(Rational(1, 1)));
    video_encoder.set_gop(1);
    video_encoder.set_max_b_frames(0);
    video_encoder.set_color_range(decoded_frame.color_range());
    video_encoder.set_colorspace(decoded_frame.color_space());

    if global_header {
        video_encoder.set_flags(codec::Flags::GLOBAL_HEADER);
    }

    let mut encoder_options = Dictionary::new();
    encoder_options.set("still-picture", "1");
    encoder_options.set("lossless", "1");
    encoder_options.set("crf", "0");
    if encoder_name == "libaom-av1" {
        encoder_options.set("cpu-used", "0");
    }

    let mut opened_encoder = video_encoder.open_with(encoder_options).map_err(|error| {
        format!(
            "Failed to open AV1 encoder '{}' with lossless settings: {error}. \
This build must support AV1 lossless options for minimal-loss AVIF output.",
            encoder_name
        )
    })?;

    output_stream.set_parameters(&opened_encoder);
    output_stream.set_time_base(opened_encoder.time_base());
    let output_stream_index = output_stream.index();
    let output_time_base = output_stream.time_base();
    drop(output_stream);

    output_context
        .write_header()
        .map_err(|error| format!("Failed writing AVIF header: {error}"))?;

    let mut converted_frame = convert_frame_to_encoder_format(&decoded_frame, output_pixel_format)?;
    converted_frame.set_pts(Some(0));

    opened_encoder
        .send_frame(&converted_frame)
        .map_err(|error| format!("Failed sending frame to AV1 encoder: {error}"))?;
    opened_encoder
        .send_eof()
        .map_err(|error| format!("Failed to flush AV1 encoder: {error}"))?;

    let encoder_time_base = opened_encoder.time_base();
    let mut encoded_packet = Packet::empty();
    loop {
        match opened_encoder.receive_packet(&mut encoded_packet) {
            Ok(()) => {
                encoded_packet.set_stream(output_stream_index);
                encoded_packet.rescale_ts(encoder_time_base, output_time_base);
                encoded_packet
                    .write_interleaved(&mut output_context)
                    .map_err(|error| format!("Failed writing encoded AVIF packet: {error}"))?;
            }
            Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => break,
            Err(ffmpeg::Error::Eof) => break,
            Err(error) => return Err(format!("Failed while receiving AV1 packet: {error}")),
        }
    }

    output_context
        .write_trailer()
        .map_err(|error| format!("Failed finalizing AVIF output: {error}"))?;

    Ok(())
}

pub fn ensure_avif_for_hdr(app_handle: &tauri::AppHandle, input: &Path) -> Result<PathBuf, String> {
    let cache_dir = get_cache_dir(app_handle)?;
    let key = compute_hash_for_file(input, &avif_context())?;
    let output_path = cache_dir.join(format!("{}.avif", key));

    // if there is an entry in the cache, return it
    if output_path.exists() {
        println!("cache hit for {}", output_path.display());
        let meta_result = output_path.metadata();
        if meta_result.is_ok() && meta_result.unwrap().len() > 0 {
            return Ok(output_path);
        }
    }

    // otherwise perform the conversion
    let result = run_hdr_to_avif_conversion(input, &output_path);
    if result.is_err() {
        let _ = fs::remove_file(&output_path);
        return Err(result.err().unwrap());
    }
    Ok(output_path)
}
