use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager};

const ENV_AUTOTEST: &str = "LOOPVIZ_AUTOTEST_MODS";
const MANIFEST_FILE: &str = "manifest.json";
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFolder {
    path: String,
    origin: &'static str,
    manifest: Option<serde_json::Value>,
    error: Option<String>,
}

fn user_mods_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().data_dir().map_err(|e| format!("не удалось определить Application Support: {e}"))?;
    Ok(base.join("LoopViz").join("mods"))
}

/// Папка `mods/` репозитория: только в dev-сборке, путь известен на этапе компиляции.
fn repo_mods_dir() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("..").join("mods");
    dir.canonicalize().ok().filter(|path| path.is_dir())
}

fn read_limited(path: &Path, limit: u64) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| format!("не удалось прочитать {}: {e}", path.display()))?;
    if !meta.is_file() {
        return Err(format!("{} не файл", path.display()));
    }
    if meta.len() > limit {
        return Err(format!("{} больше {} КБ", path.display(), limit / 1024));
    }
    fs::read_to_string(path).map_err(|e| format!("не удалось прочитать {}: {e}", path.display()))
}

fn describe_folder(path: &Path, origin: &'static str) -> ModFolder {
    let manifest_path = path.join(MANIFEST_FILE);
    let parsed = read_limited(&manifest_path, MAX_MANIFEST_BYTES).and_then(|text| {
        serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("manifest.json не разобран: {e}"))
    });
    let (manifest, error) = match parsed {
        Ok(value) => (Some(value), None),
        Err(message) => (None, Some(message)),
    };
    ModFolder { path: path.display().to_string(), origin, manifest, error }
}

/// Подпапки каталога по алфавиту; скрытые и не-папки пропускаются.
fn scan_dir(dir: &Path, origin: &'static str) -> Vec<ModFolder> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut folders: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter(|path| path.file_name().and_then(|name| name.to_str()).is_some_and(|name| !name.starts_with('.')))
        .collect();
    folders.sort();
    folders.iter().map(|path| describe_folder(path, origin)).collect()
}

/// Файл внутри папки мода. Обе стороны канонизируются, поэтому `..` и симлинки наружу отвергаются.
fn resolve_inside(mod_path: &str, rel_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(mod_path).canonicalize().map_err(|e| format!("папка мода недоступна: {e}"))?;
    let target = root.join(rel_path).canonicalize().map_err(|e| format!("файл {rel_path} недоступен: {e}"))?;
    if target.starts_with(&root) {
        Ok(target)
    } else {
        Err(format!("путь {rel_path} выходит за пределы папки мода"))
    }
}

/// Мод можно читать только из известных каталогов модов, а не из произвольного места диска.
fn is_known_mod_folder(app: &AppHandle, mod_path: &str) -> Result<(), String> {
    let candidate = Path::new(mod_path).canonicalize().map_err(|e| format!("папка мода недоступна: {e}"))?;
    let parent = candidate.parent().ok_or("у папки мода нет родителя")?;
    let mut roots = vec![user_mods_dir(app)?];
    roots.extend(repo_mods_dir());
    let known = roots.iter().filter_map(|root| root.canonicalize().ok()).any(|root| root == parent);
    if known {
        Ok(())
    } else {
        Err("папка не лежит в каталоге модов".to_string())
    }
}

#[tauri::command]
pub fn mods_dir(app: AppHandle) -> Result<String, String> {
    let dir = user_mods_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("не удалось создать {}: {e}", dir.display()))?;
    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn list_mods(app: AppHandle) -> Result<Vec<ModFolder>, String> {
    let user = user_mods_dir(&app)?;
    fs::create_dir_all(&user).map_err(|e| format!("не удалось создать {}: {e}", user.display()))?;
    let mut folders = scan_dir(&user, "user");
    if let Some(repo) = repo_mods_dir() {
        folders.extend(scan_dir(&repo, "repo"));
    }
    Ok(folders)
}

#[tauri::command]
pub fn read_mod_file(app: AppHandle, mod_path: String, rel_path: String) -> Result<String, String> {
    is_known_mod_folder(&app, &mod_path)?;
    let target = resolve_inside(&mod_path, &rel_path)?;
    read_limited(&target, MAX_FILE_BYTES)
}

#[tauri::command]
pub fn reveal_mods_dir(app: AppHandle) -> Result<(), String> {
    let dir = mods_dir(app)?;
    let status = Command::new("open").arg(&dir).status().map_err(|e| format!("open: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open завершился с кодом {status}"))
    }
}

fn autotest_enabled() -> bool {
    env::var(ENV_AUTOTEST).is_ok_and(|value| value == "1")
}

/// Автотест модов включается только переменной LOOPVIZ_AUTOTEST_MODS=1; без неё три команды ниже отказывают.
#[tauri::command]
pub fn mods_autotest_enabled() -> bool {
    autotest_enabled()
}

#[tauri::command]
pub fn mods_autotest_log(message: String) -> Result<(), String> {
    if !autotest_enabled() {
        return Err("автотест модов выключен".to_string());
    }
    let mut out = std::io::stdout().lock();
    writeln!(out, "[autotest-mods] {message}").map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mods_autotest_exit(app: AppHandle, code: i32) -> Result<(), String> {
    if !autotest_enabled() {
        return Err("автотест модов выключен".to_string());
    }
    app.exit(code);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("loopviz-mods-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn reads_files_inside_the_mod_folder() {
        let root = temp_dir("inside");
        fs::create_dir_all(root.join("sub")).expect("mkdir");
        fs::write(root.join("sub").join("index.js"), "export default 1").expect("write");
        let path = resolve_inside(root.to_str().expect("utf8"), "sub/index.js").expect("resolve");
        assert!(path.ends_with("sub/index.js"));
    }

    #[test]
    fn rejects_parent_traversal() {
        let root = temp_dir("traversal");
        let mod_dir = root.join("mod");
        fs::create_dir_all(&mod_dir).expect("mkdir");
        fs::write(root.join("secret.txt"), "secret").expect("write");
        let error = resolve_inside(mod_dir.to_str().expect("utf8"), "../secret.txt").expect_err("must fail");
        assert!(error.contains("за пределы"));
    }

    #[test]
    fn rejects_absolute_paths_and_missing_files() {
        let root = temp_dir("absolute");
        fs::write(root.join("a.js"), "x").expect("write");
        let outside = temp_dir("absolute-outside").join("b.js");
        fs::write(&outside, "x").expect("write");
        let mod_path = root.to_str().expect("utf8");
        assert!(resolve_inside(mod_path, outside.to_str().expect("utf8")).is_err());
        assert!(resolve_inside(mod_path, "missing.js").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_pointing_outside() {
        let root = temp_dir("symlink");
        let mod_dir = root.join("mod");
        fs::create_dir_all(&mod_dir).expect("mkdir");
        fs::write(root.join("secret.txt"), "secret").expect("write");
        std::os::unix::fs::symlink(root.join("secret.txt"), mod_dir.join("link.js")).expect("symlink");
        assert!(resolve_inside(mod_dir.to_str().expect("utf8"), "link.js").is_err());
    }

    #[test]
    fn scan_reports_manifest_problems_per_folder() {
        let root = temp_dir("scan");
        let good = root.join("good");
        let broken = root.join("broken");
        let empty = root.join("empty");
        for dir in [&good, &broken, &empty, &root.join(".hidden")] {
            fs::create_dir_all(dir).expect("mkdir");
        }
        fs::write(good.join("manifest.json"), r#"{"id":"good"}"#).expect("write");
        fs::write(broken.join("manifest.json"), "{ not json").expect("write");
        fs::write(root.join("loose-file.txt"), "x").expect("write");

        let folders = scan_dir(&root, "user");
        let names: Vec<&str> = folders.iter().filter_map(|f| f.path.rsplit('/').next()).collect();
        assert_eq!(names, vec!["broken", "empty", "good"]);
        assert!(folders[0].error.as_deref().is_some_and(|e| e.contains("не разобран")));
        assert!(folders[1].error.is_some());
        assert!(folders[2].manifest.is_some() && folders[2].error.is_none());
    }

    #[test]
    fn oversized_files_are_refused() {
        let root = temp_dir("size");
        let file = root.join("big.js");
        fs::write(&file, vec![b'a'; 2048]).expect("write");
        assert!(read_limited(&file, 1024).is_err());
        assert!(read_limited(&file, 4096).is_ok());
    }
}
