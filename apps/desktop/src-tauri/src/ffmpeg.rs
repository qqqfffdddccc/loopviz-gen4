use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Deserialize;

const FIXED_PATHS: [&str; 2] = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Codec {
    H264,
    Hevc,
}

/// Порядок поиска: LOOPVIZ_FFMPEG, Homebrew, /usr/local, PATH.
/// TODO: положить ffmpeg в бандл как sidecar (`bundle.externalBin`) и искать его первым.
pub fn resolve_ffmpeg() -> Result<PathBuf, String> {
    if let Some(custom) = env::var_os("LOOPVIZ_FFMPEG") {
        let path = PathBuf::from(custom);
        return if path.is_file() {
            Ok(path)
        } else {
            Err(format!("LOOPVIZ_FFMPEG указывает на несуществующий файл: {}", path.display()))
        };
    }
    for fixed in FIXED_PATHS {
        let path = Path::new(fixed);
        if path.is_file() {
            return Ok(path.to_path_buf());
        }
    }
    if let Some(paths) = env::var_os("PATH") {
        for dir in env::split_paths(&paths) {
            let candidate = dir.join("ffmpeg");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    Err("ffmpeg не найден: задайте LOOPVIZ_FFMPEG или установите ffmpeg (brew install ffmpeg)".to_string())
}

fn is_4k(width: u32, height: u32) -> bool {
    u64::from(width) * u64::from(height) >= 3_000_000
}

pub fn encoder_name(codec: Codec, hardware: bool) -> &'static str {
    match (codec, hardware) {
        (Codec::H264, true) => "h264_videotoolbox",
        (Codec::H264, false) => "libx264",
        (Codec::Hevc, true) => "hevc_videotoolbox",
        (Codec::Hevc, false) => "libx265",
    }
}

pub fn encoder_args(codec: Codec, hardware: bool, width: u32, height: u32) -> Vec<String> {
    let big = is_4k(width, height);
    let mut args = vec!["-c:v".to_string(), encoder_name(codec, hardware).to_string()];
    let tail: &[&str] = match (codec, hardware) {
        (Codec::H264, true) => &["-b:v", if big { "60M" } else { "20M" }],
        (Codec::H264, false) => &["-crf", "16", "-preset", "medium"],
        (Codec::Hevc, true) => &["-tag:v", "hvc1", "-b:v", if big { "45M" } else { "16M" }],
        (Codec::Hevc, false) => &["-tag:v", "hvc1", "-crf", "18", "-preset", "medium"],
    };
    args.extend(tail.iter().map(|s| (*s).to_string()));
    args
}

/// Пробный кодировать-в-никуда: videotoolbox может не стартовать, а ffmpeg узнаёт об этом лишь после первого кадра.
pub fn hardware_encoder_works(ffmpeg: &Path, codec: Codec, width: u32, height: u32) -> bool {
    let source = format!("color=c=black:s={width}x{height}:r=30:d=0.2");
    Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", &source, "-frames:v", "2", "-pix_fmt", "yuv420p"])
        .args(encoder_args(codec, true, width, height))
        .args(["-f", "null", "-"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub struct EncodeJob<'a> {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub codec: Codec,
    pub hardware: bool,
    pub audio: &'a Path,
    pub output: &'a Path,
}

pub fn build_args(job: &EncodeJob<'_>) -> Vec<String> {
    let mut args: Vec<String> = [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-nostats",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
    ]
    .iter()
    .map(|s| (*s).to_string())
    .collect();
    args.push(format!("{}x{}", job.width, job.height));
    args.extend(["-r".to_string(), job.fps.to_string(), "-i".to_string(), "pipe:0".to_string()]);
    args.extend(["-i".to_string(), job.audio.display().to_string()]);
    args.extend(["-map", "0:v:0", "-map", "1:a:0"].iter().map(|s| (*s).to_string()));
    args.extend(
        [
            "-vf",
            "scale=in_range=full:out_range=tv:out_color_matrix=bt709",
            "-colorspace",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-color_range",
            "tv",
        ]
        .iter()
        .map(|s| (*s).to_string()),
    );
    args.extend(encoder_args(job.codec, job.hardware, job.width, job.height));
    args.extend(
        ["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", "-f", "mp4"]
            .iter()
            .map(|s| (*s).to_string()),
    );
    args.push(job.output.display().to_string());
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bitrate_depends_on_resolution() {
        assert!(encoder_args(Codec::H264, true, 1080, 1920).contains(&"20M".to_string()));
        assert!(encoder_args(Codec::H264, true, 2160, 3840).contains(&"60M".to_string()));
    }

    #[test]
    fn software_fallbacks_use_crf() {
        let args = encoder_args(Codec::H264, false, 1080, 1920);
        assert_eq!(args[1], "libx264");
        assert!(args.contains(&"16".to_string()));
        assert_eq!(encoder_name(Codec::Hevc, false), "libx265");
    }

    #[test]
    fn hevc_is_tagged_for_apple_players() {
        assert!(encoder_args(Codec::Hevc, true, 1080, 1920).contains(&"hvc1".to_string()));
    }

    #[test]
    fn args_contain_pipe_input_and_audio() {
        let job = EncodeJob {
            width: 1080,
            height: 1920,
            fps: 60,
            codec: Codec::H264,
            hardware: true,
            audio: Path::new("/tmp/a.wav"),
            output: Path::new("/tmp/o.mp4.part"),
        };
        let args = build_args(&job).join(" ");
        assert!(args.contains("-f rawvideo -pix_fmt rgba -s 1080x1920 -r 60 -i pipe:0 -i /tmp/a.wav"));
        assert!(args.ends_with("/tmp/o.mp4.part"));
    }
}
