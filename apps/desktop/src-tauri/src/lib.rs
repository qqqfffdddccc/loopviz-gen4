mod autotest;
mod export;
mod ffmpeg;
mod mods;
mod project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(export::ExportState::default())
        .invoke_handler(tauri::generate_handler![
            export::export_begin,
            export::export_frame,
            export::export_finish,
            export::export_cancel,
            export::write_temp_wav,
            export::export_ffmpeg_path,
            export::default_export_dir,
            export::reveal_in_finder,
            mods::mods_dir,
            mods::list_mods,
            mods::read_mod_file,
            mods::reveal_mods_dir,
            mods::mods_autotest_enabled,
            mods::mods_autotest_log,
            mods::mods_autotest_exit,
            project::media_store,
            project::media_read,
            project::project_save,
            project::project_open,
            project::autosave_write,
            project::autosave_read,
            project::autosave_clear,
            project::recent_projects,
            project::default_project_dir,
            autotest::autotest_config,
            autotest::autotest_read_fixture,
            autotest::autotest_log,
            autotest::autotest_exit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LoopViz");
}
