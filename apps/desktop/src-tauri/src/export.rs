use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::async_runtime::{channel, spawn_blocking, Receiver, Sender};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

use crate::ffmpeg::{build_args, encoder_name, hardware_encoder_works, resolve_ffmpeg, Codec, EncodeJob, PixelFormat};

const CHANNEL_CAPACITY: usize = 16;
const STDERR_TAIL_BYTES: usize = 6000;
const FRAME_INDEX_HEADER: &str = "x-frame-index";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    width: u32,
    height: u32,
    fps: u32,
    codec: Codec,
    pixel_format: PixelFormat,
    audio_path: String,
    output_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginInfo {
    encoder: String,
    hardware: bool,
    ffmpeg: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishInfo {
    path: String,
    frames: u64,
    encoder: String,
}

struct Frame {
    index: u64,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct Shared {
    error: Mutex<Option<String>>,
    stderr_tail: Mutex<Vec<u8>>,
    written: AtomicU64,
}

impl Shared {
    fn set_error(&self, message: String) {
        if let Ok(mut slot) = self.error.lock() {
            slot.get_or_insert(message);
        }
    }

    fn error(&self) -> Option<String> {
        self.error.lock().ok().and_then(|slot| slot.clone())
    }

    fn stderr_text(&self) -> String {
        self.stderr_tail
            .lock()
            .map(|tail| String::from_utf8_lossy(&tail).trim().to_string())
            .unwrap_or_default()
    }
}

struct Session {
    child: Child,
    tx: Option<Sender<Frame>>,
    writer: Option<JoinHandle<()>>,
    stderr_reader: Option<JoinHandle<()>>,
    shared: Arc<Shared>,
    output: PathBuf,
    part: PathBuf,
    audio: PathBuf,
    encoder: String,
    frame_bytes: u64,
}

#[derive(Default)]
pub struct ExportState(Mutex<Option<Session>>);

fn lock(state: &ExportState) -> Result<MutexGuard<'_, Option<Session>>, String> {
    state.0.lock().map_err(|_| "состояние экспорта повреждено".to_string())
}

fn part_path(output: &Path) -> PathBuf {
    let mut name = output.as_os_str().to_os_string();
    name.push(".part");
    PathBuf::from(name)
}

/// Кадры приходят параллельными вызовами IPC и могут обогнать друг друга, поэтому пишем по номеру.
fn run_writer(mut rx: Receiver<Frame>, mut stdin: ChildStdin, shared: Arc<Shared>) {
    let mut pending: BTreeMap<u64, Vec<u8>> = BTreeMap::new();
    let mut next = 0u64;
    while let Some(frame) = rx.blocking_recv() {
        pending.insert(frame.index, frame.bytes);
        while let Some(bytes) = pending.remove(&next) {
            if let Err(error) = stdin.write_all(&bytes) {
                shared.set_error(format!("ffmpeg перестал принимать кадры: {error}"));
                return;
            }
            next += 1;
            shared.written.store(next, Ordering::Relaxed);
        }
    }
    if !pending.is_empty() {
        shared.set_error(format!("потерян кадр {next}"));
    }
}

fn run_stderr_reader(mut stderr: impl Read, shared: Arc<Shared>) {
    let mut chunk = [0u8; 2048];
    while let Ok(read) = stderr.read(&mut chunk) {
        if read == 0 {
            break;
        }
        if let Ok(mut tail) = shared.stderr_tail.lock() {
            tail.extend_from_slice(&chunk[..read]);
            let excess = tail.len().saturating_sub(STDERR_TAIL_BYTES);
            tail.drain(..excess);
        }
    }
}

fn discard(session: &mut Session) {
    let _ = session.child.kill();
    let _ = session.child.wait();
    session.tx = None;
    if let Some(writer) = session.writer.take() {
        let _ = writer.join();
    }
    if let Some(reader) = session.stderr_reader.take() {
        let _ = reader.join();
    }
    let _ = fs::remove_file(&session.part);
    let _ = fs::remove_file(&session.audio);
}

fn spawn_session(options: &ExportOptions) -> Result<(Session, BeginInfo), String> {
    if options.width == 0 || options.height == 0 || options.fps == 0 {
        return Err("некорректные размеры или fps".to_string());
    }
    let ffmpeg = resolve_ffmpeg()?;
    let audio = PathBuf::from(&options.audio_path);
    if !audio.is_file() {
        return Err(format!("нет файла звука: {}", audio.display()));
    }
    let output = PathBuf::from(&options.output_path);
    if let Some(dir) = output.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("не удалось создать папку {}: {e}", dir.display()))?;
    }
    let part = part_path(&output);
    let hardware = hardware_encoder_works(&ffmpeg, options.codec, options.width, options.height);
    let job = EncodeJob {
        width: options.width,
        height: options.height,
        fps: options.fps,
        codec: options.codec,
        hardware,
        pixel_format: options.pixel_format,
        audio: &audio,
        output: &part,
    };
    let mut child = Command::new(&ffmpeg)
        .args(build_args(&job))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("не удалось запустить ffmpeg ({}): {e}", ffmpeg.display()))?;

    let shared = Arc::new(Shared::default());
    let (stdin, stderr) = match (child.stdin.take(), child.stderr.take()) {
        (Some(stdin), Some(stderr)) => (stdin, stderr),
        _ => {
            let _ = child.kill();
            return Err("у ffmpeg нет stdin/stderr".to_string());
        }
    };
    let (tx, rx) = channel::<Frame>(CHANNEL_CAPACITY);
    let writer_shared = Arc::clone(&shared);
    let reader_shared = Arc::clone(&shared);
    let encoder = encoder_name(options.codec, hardware).to_string();
    let session = Session {
        child,
        tx: Some(tx),
        writer: Some(std::thread::spawn(move || run_writer(rx, stdin, writer_shared))),
        stderr_reader: Some(std::thread::spawn(move || run_stderr_reader(stderr, reader_shared))),
        shared,
        output,
        part,
        audio,
        encoder: encoder.clone(),
        frame_bytes: options.pixel_format.frame_bytes(options.width, options.height),
    };
    let info = BeginInfo { encoder, hardware, ffmpeg: ffmpeg.display().to_string() };
    Ok((session, info))
}

#[tauri::command]
pub fn export_begin(state: State<'_, ExportState>, options: ExportOptions) -> Result<BeginInfo, String> {
    let mut slot = lock(&state)?;
    if let Some(mut stale) = slot.take() {
        discard(&mut stale);
    }
    match spawn_session(&options) {
        Ok((session, info)) => {
            *slot = Some(session);
            Ok(info)
        }
        Err(error) => {
            let _ = fs::remove_file(&options.audio_path);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn export_frame(state: State<'_, ExportState>, request: Request<'_>) -> Result<(), String> {
    let index = request
        .headers()
        .get(FRAME_INDEX_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|text| text.parse::<u64>().ok())
        .ok_or_else(|| format!("нет заголовка {FRAME_INDEX_HEADER}"))?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("кадр должен прийти сырыми байтами".to_string());
    };
    let (tx, shared, frame_bytes) = {
        let slot = lock(&state)?;
        let session = slot.as_ref().ok_or("экспорт не запущен")?;
        (session.tx.clone().ok_or("экспорт уже завершается")?, Arc::clone(&session.shared), session.frame_bytes)
    };
    if bytes.len() as u64 != frame_bytes {
        return Err(format!("кадр {index}: {} байт вместо {frame_bytes}", bytes.len()));
    }
    if let Some(error) = shared.error() {
        return Err(error);
    }
    tx.send(Frame { index, bytes: bytes.clone() })
        .await
        .map_err(|_| shared.error().unwrap_or_else(|| "ffmpeg завершился раньше времени".to_string()))
}

fn finish_session(mut session: Session) -> Result<FinishInfo, String> {
    session.tx = None;
    if let Some(writer) = session.writer.take() {
        let _ = writer.join();
    }
    let status = session.child.wait().map_err(|e| format!("ffmpeg: {e}"));
    if let Some(reader) = session.stderr_reader.take() {
        let _ = reader.join();
    }
    let _ = fs::remove_file(&session.audio);

    let failure = match status {
        Ok(status) if status.success() && session.shared.error().is_none() => None,
        Ok(status) => Some(format!("ffmpeg завершился с кодом {status}")),
        Err(error) => Some(error),
    };
    if let Some(reason) = failure {
        let _ = fs::remove_file(&session.part);
        let detail = session.shared.error().map(|e| format!("{e}\n")).unwrap_or_default();
        return Err(format!("{reason}\n{detail}{}", session.shared.stderr_text()).trim().to_string());
    }
    fs::rename(&session.part, &session.output).map_err(|e| format!("не удалось сохранить {}: {e}", session.output.display()))?;
    Ok(FinishInfo {
        path: session.output.display().to_string(),
        frames: session.shared.written.load(Ordering::Relaxed),
        encoder: session.encoder,
    })
}

#[tauri::command]
pub async fn export_finish(state: State<'_, ExportState>) -> Result<FinishInfo, String> {
    let session = lock(&state)?.take().ok_or("экспорт не запущен")?;
    spawn_blocking(move || finish_session(session))
        .await
        .map_err(|e| format!("поток завершения упал: {e}"))?
}

#[tauri::command]
pub fn export_cancel(state: State<'_, ExportState>) -> Result<(), String> {
    if let Some(mut session) = lock(&state)?.take() {
        discard(&mut session);
    }
    Ok(())
}

#[tauri::command]
pub async fn write_temp_wav(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("WAV должен прийти сырыми байтами".to_string());
    };
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let path = std::env::temp_dir().join(format!("loopviz-export-{}-{nanos}.wav", std::process::id()));
    fs::write(&path, bytes).map_err(|e| format!("не удалось записать {}: {e}", path.display()))?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn export_ffmpeg_path() -> Result<String, String> {
    resolve_ffmpeg().map(|path| path.display().to_string())
}

#[tauri::command]
pub fn default_export_dir() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "переменная HOME не задана".to_string())?;
    let dir = Path::new(&home).join("Movies").join("LoopViz");
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {}: {e}", dir.display()))?;
    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let status = Command::new("open").arg("-R").arg(&path).status().map_err(|e| format!("open: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open -R завершился с кодом {status}"))
    }
}
