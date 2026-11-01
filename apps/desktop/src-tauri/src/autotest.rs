use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::AppHandle;

const ENV_REPO: &str = "LOOPVIZ_AUTOTEST_EXPORT";
const ENV_RES: &str = "LOOPVIZ_AUTOTEST_RES";
const FIXTURES: [&str; 2] = ["test-loop.wav", "test-loop.mid"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutotestConfig {
    resolution: String,
}

fn repo_dir() -> Option<PathBuf> {
    env::var_os(ENV_REPO).filter(|value| !value.is_empty()).map(PathBuf::from)
}

/// None, пока не задана LOOPVIZ_AUTOTEST_EXPORT: без неё хук не включается и команды ниже отказывают.
#[tauri::command]
pub fn autotest_config() -> Option<AutotestConfig> {
    repo_dir()?;
    let resolution = match env::var(ENV_RES).as_deref() {
        Ok("4k") => "4k",
        _ => "1080p",
    };
    Some(AutotestConfig { resolution: resolution.to_string() })
}

#[tauri::command]
pub fn autotest_read_fixture(name: String) -> Result<Response, String> {
    let repo = repo_dir().ok_or("автотест выключен")?;
    if !FIXTURES.contains(&name.as_str()) {
        return Err(format!("неизвестная фикстура: {name}"));
    }
    let path = repo.join("fixtures").join(&name);
    fs::read(&path).map(Response::new).map_err(|e| format!("не удалось прочитать {}: {e}", path.display()))
}

#[tauri::command]
pub fn autotest_log(message: String) -> Result<(), String> {
    repo_dir().ok_or("автотест выключен")?;
    let mut out = std::io::stdout().lock();
    writeln!(out, "[autotest] {message}").map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autotest_exit(app: AppHandle, code: i32) -> Result<(), String> {
    repo_dir().ok_or("автотест выключен")?;
    app.exit(code);
    Ok(())
}
