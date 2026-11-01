use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

const APP_DIR_NAME: &str = "LoopViz";
const PROJECT_EXTENSION: &str = "loopviz";
const MEDIA_EXT_HEADER: &str = "x-media-ext";
const MEDIA_EXTENSIONS: [&str; 7] = ["wav", "mp3", "flac", "aif", "aiff", "mid", "midi"];
const AUTOSAVE_FILE: &str = "autosave.loopviz.json";
const RECENT_FILE: &str = "recent.json";
const RECENT_LIMIT: usize = 8;
const MAX_PROJECT_BYTES: u64 = 256 * 1024 * 1024;

static RECENT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    hash: String,
    path: String,
}

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().data_dir().map_err(|e| format!("нет каталога данных приложения: {e}"))?;
    let dir = base.join(APP_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {}: {e}", dir.display()))?;
    Ok(dir)
}

fn media_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_dir(app)?.join("media");
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {}: {e}", dir.display()))?;
    Ok(dir)
}

fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}

fn is_valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Имя файла кеша собирается только из проверенных хеша и расширения: выйти из каталога нельзя.
fn media_file_name(hash: &str, ext: &str) -> Result<String, String> {
    if !is_valid_hash(hash) {
        return Err("хеш медиа должен быть sha256 в нижнем регистре".to_string());
    }
    let ext = ext.to_ascii_lowercase();
    if !MEDIA_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("расширение .{ext} не поддерживается"));
    }
    Ok(format!("{hash}.{ext}"))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let name = path.file_name().and_then(|n| n.to_str()).ok_or("некорректный путь файла")?;
    let temp = path.with_file_name(format!(".{name}.tmp-{}", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, path)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temp);
        return Err(format!("не удалось записать {}: {error}", path.display()));
    }
    Ok(())
}

fn store_media(dir: &Path, bytes: &[u8], ext: &str) -> Result<MediaInfo, String> {
    let hash = hex_sha256(bytes);
    let path = dir.join(media_file_name(&hash, ext)?);
    if !path.exists() {
        write_atomic(&path, bytes)?;
    }
    Ok(MediaInfo { hash, path: path.display().to_string() })
}

fn with_project_extension(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("путь проекта пуст".to_string());
    }
    let mut path = PathBuf::from(path);
    if path.file_name().is_none() {
        return Err("путь проекта не указывает на файл".to_string());
    }
    if path.extension().and_then(|e| e.to_str()) != Some(PROJECT_EXTENSION) {
        let mut name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
        name.push(format!(".{PROJECT_EXTENSION}"));
        path.set_file_name(name);
    }
    Ok(path)
}

fn pushed_recent(list: Vec<String>, path: &str) -> Vec<String> {
    let mut next = vec![path.to_string()];
    next.extend(list.into_iter().filter(|item| item != path));
    next.truncate(RECENT_LIMIT);
    next
}

fn read_recent(file: &Path) -> Vec<String> {
    fs::read_to_string(file).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

fn remember_recent(app: &AppHandle, path: &Path) {
    let Ok(dir) = app_dir(app) else { return };
    let Ok(_guard) = RECENT_LOCK.lock() else { return };
    let file = dir.join(RECENT_FILE);
    let next = pushed_recent(read_recent(&file), &path.display().to_string());
    if let Ok(text) = serde_json::to_string(&next) {
        let _ = write_atomic(&file, text.as_bytes());
    }
}

#[tauri::command]
pub async fn media_store(app: AppHandle, request: Request<'_>) -> Result<MediaInfo, String> {
    let ext = request
        .headers()
        .get(MEDIA_EXT_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| format!("нет заголовка {MEDIA_EXT_HEADER}"))?
        .to_string();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("файл должен прийти сырыми байтами".to_string());
    };
    store_media(&media_dir(&app)?, bytes, &ext)
}

#[tauri::command]
pub async fn media_read(app: AppHandle, hash: String, ext: String) -> Result<Response, String> {
    let path = media_dir(&app)?.join(media_file_name(&hash, &ext)?);
    fs::read(&path).map(Response::new).map_err(|e| format!("нет файла в кеше медиа {}: {e}", path.display()))
}

#[tauri::command]
pub async fn project_save(app: AppHandle, path: String, json: String) -> Result<String, String> {
    let target = with_project_extension(&path)?;
    if let Some(parent) = target.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|e| format!("не удалось создать {}: {e}", parent.display()))?;
    }
    write_atomic(&target, json.as_bytes())?;
    remember_recent(&app, &target);
    Ok(target.display().to_string())
}

#[tauri::command]
pub async fn project_open(app: AppHandle, path: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    let size = fs::metadata(&source).map_err(|e| format!("не удалось открыть {path}: {e}"))?.len();
    if size > MAX_PROJECT_BYTES {
        return Err(format!("файл проекта слишком велик: {size} байт"));
    }
    let text = fs::read_to_string(&source).map_err(|e| format!("не удалось прочитать {path}: {e}"))?;
    remember_recent(&app, &source);
    Ok(text)
}

#[tauri::command]
pub async fn autosave_write(app: AppHandle, json: String) -> Result<(), String> {
    write_atomic(&app_dir(&app)?.join(AUTOSAVE_FILE), json.as_bytes())
}

#[tauri::command]
pub async fn autosave_read(app: AppHandle) -> Result<Option<String>, String> {
    let file = app_dir(&app)?.join(AUTOSAVE_FILE);
    match fs::read_to_string(&file) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("не удалось прочитать {}: {error}", file.display())),
    }
}

#[tauri::command]
pub async fn autosave_clear(app: AppHandle) -> Result<(), String> {
    let file = app_dir(&app)?.join(AUTOSAVE_FILE);
    match fs::remove_file(&file) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("не удалось удалить {}: {error}", file.display())),
    }
}

#[tauri::command]
pub async fn recent_projects(app: AppHandle) -> Result<Vec<String>, String> {
    let list = read_recent(&app_dir(&app)?.join(RECENT_FILE));
    Ok(list.into_iter().filter(|path| Path::new(path).is_file()).collect())
}

#[tauri::command]
pub async fn default_project_dir(app: AppHandle) -> Result<String, String> {
    let base = app.path().document_dir().map_err(|e| format!("нет каталога Documents: {e}"))?;
    let dir = base.join(APP_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {}: {e}", dir.display()))?;
    Ok(dir.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("loopviz-test-{label}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(hex_sha256(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn media_names_reject_traversal_and_bad_input() {
        let hash = "a".repeat(64);
        assert_eq!(media_file_name(&hash, "WAV").as_deref(), Ok(format!("{hash}.wav").as_str()));
        assert!(media_file_name("../etc/passwd", "wav").is_err());
        assert!(media_file_name(&"A".repeat(64), "wav").is_err());
        assert!(media_file_name(&hash, "../x").is_err());
        assert!(media_file_name(&hash, "exe").is_err());
    }

    #[test]
    fn store_media_skips_existing_file() {
        let dir = scratch_dir("media");
        let first = store_media(&dir, b"hello", "wav").expect("first store");
        let stored = PathBuf::from(&first.path);
        assert_eq!(fs::read(&stored).expect("read back"), b"hello");

        let marker = fs::metadata(&stored).expect("meta").modified().expect("mtime");
        let second = store_media(&dir, b"hello", "wav").expect("second store");
        assert_eq!(first.hash, second.hash);
        assert_eq!(fs::metadata(&stored).expect("meta").modified().expect("mtime"), marker);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn atomic_write_replaces_content_and_leaves_no_temp() {
        let dir = scratch_dir("atomic");
        let file = dir.join("p.loopviz");
        write_atomic(&file, b"one").expect("write one");
        write_atomic(&file, b"two").expect("write two");
        assert_eq!(fs::read(&file).expect("read"), b"two");
        let leftovers = fs::read_dir(&dir).expect("dir").count();
        assert_eq!(leftovers, 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn project_path_gets_extension() {
        assert_eq!(with_project_extension("/tmp/a").expect("ok"), PathBuf::from("/tmp/a.loopviz"));
        assert_eq!(with_project_extension("/tmp/a.loopviz").expect("ok"), PathBuf::from("/tmp/a.loopviz"));
        assert_eq!(with_project_extension("/tmp/a.b").expect("ok"), PathBuf::from("/tmp/a.b.loopviz"));
        assert!(with_project_extension("  ").is_err());
        assert!(with_project_extension("/").is_err());
    }

    #[test]
    fn recent_list_is_deduplicated_and_capped() {
        let mut list = Vec::new();
        for i in 0..12 {
            list = pushed_recent(list, &format!("/p/{i}.loopviz"));
        }
        assert_eq!(list.len(), RECENT_LIMIT);
        assert_eq!(list[0], "/p/11.loopviz");
        let list = pushed_recent(list, "/p/8.loopviz");
        assert_eq!(list[0], "/p/8.loopviz");
        assert_eq!(list.iter().filter(|p| p.as_str() == "/p/8.loopviz").count(), 1);
    }
}
