mod exports;
mod store;
#[cfg(desktop)]
mod tray;

use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

#[tauri::command]
fn load_projects(file: State<'_, Mutex<PathBuf>>) -> Result<store::Index, String> {
    let file = file.lock().map_err(|e| e.to_string())?;
    store::read(&file)
}

#[tauri::command]
fn save_projects(
    index: store::Index,
    file: State<'_, Mutex<PathBuf>>,
) -> Result<store::Index, String> {
    let file = file.lock().map_err(|e| e.to_string())?;
    store::save(&file, index)
}

#[tauri::command]
fn export_file(app: tauri::AppHandle, content: String, name: String) -> Result<String, String> {
    let directory = app.path().download_dir().map_err(|e| e.to_string())?;
    exports::write(&directory, &name, &content).map(|path| path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Mutex::new(app.path().app_data_dir()?.join("projects.json")));
            #[cfg(desktop)]
            tray::setup(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_projects,
            save_projects,
            export_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Localist");
}
