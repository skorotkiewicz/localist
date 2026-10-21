mod exports;
mod publishing;
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

#[tauri::command]
async fn load_publishing(
    publisher: State<'_, publishing::Publisher>,
) -> Result<publishing::Settings, String> {
    publisher.settings().await
}

#[tauri::command]
async fn save_publishing(
    enabled: bool,
    server_url: String,
    publisher: State<'_, publishing::Publisher>,
) -> Result<publishing::Settings, String> {
    publisher.configure(enabled, server_url).await
}

#[tauri::command]
async fn publish_projects(
    file: State<'_, Mutex<PathBuf>>,
    publisher: State<'_, publishing::Publisher>,
) -> Result<Option<String>, String> {
    publisher.publish(&file).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            app.manage(Mutex::new(directory.join("projects.json")));
            app.manage(publishing::Publisher::new(
                directory.join("publishing.json"),
            ));
            #[cfg(desktop)]
            tray::setup(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_projects,
            save_projects,
            export_file,
            load_publishing,
            save_publishing,
            publish_projects
        ])
        .run(tauri::generate_context!())
        .expect("error while running Localist");
}
