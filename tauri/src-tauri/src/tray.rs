use tauri::{
    App, AppHandle, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

fn should_show(visible: bool, minimized: bool) -> bool {
    !visible || minimized
}

fn toggle_window(app: &AppHandle) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or(tauri::Error::WindowNotFound)?;
    if should_show(window.is_visible()?, window.is_minimized()?) {
        window.unminimize()?;
        window.show()?;
        window.set_focus()
    } else {
        window.hide()
    }
}

pub fn setup(app: &App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(
        app,
        "tray-toggle",
        "Show / hide Localist",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;
    let icon = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::AssetNotFound("application icon".into()))?;

    TrayIconBuilder::new()
        .icon(icon.clone())
        .tooltip("Localist")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-toggle" => {
                if let Err(error) = toggle_window(app) {
                    eprintln!("Could not show or hide Localist: {error}");
                }
            }
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
                && let Err(error) = toggle_window(tray.app_handle())
            {
                eprintln!("Could not show or hide Localist: {error}");
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::should_show;

    #[test]
    fn toggle_shows_hidden_or_minimized_windows_and_hides_visible_windows() {
        assert!(should_show(false, false));
        assert!(should_show(false, true));
        assert!(should_show(true, true));
        assert!(!should_show(true, false));
    }
}
