use crate::store;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use reqwest::{Client, StatusCode, Url, redirect::Policy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    net::IpAddr,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

const DEFAULT_SERVER: &str = "http://127.0.0.1:8080";
const CHECKSUM_CONTEXT: &str = "localist-publish:token:v1:";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    enabled: bool,
    server_url: String,
    token: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            server_url: DEFAULT_SERVER.into(),
            token: None,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    enabled: bool,
    server_url: String,
    public_url: Option<String>,
}

impl Config {
    fn settings(&self) -> Settings {
        Settings {
            enabled: self.enabled,
            server_url: self.server_url.clone(),
            public_url: self.token.as_ref().map(|token| {
                format!(
                    "{}/documents/{:x}",
                    self.server_url,
                    Sha256::digest(token.as_bytes())
                )
            }),
        }
    }
}

pub struct Publisher {
    file: PathBuf,
    // shortcut: serialization is per process; use an OS-wide lock before sharing an index between app instances.
    lock: tauri::async_runtime::Mutex<()>,
}

impl Publisher {
    pub fn new(file: PathBuf) -> Self {
        Self {
            file,
            lock: tauri::async_runtime::Mutex::new(()),
        }
    }

    pub async fn settings(&self) -> Result<Settings, String> {
        let _guard = self.lock.lock().await;
        Ok(read_config(&self.file)?.settings())
    }

    pub async fn configure(&self, enabled: bool, server_url: String) -> Result<Settings, String> {
        let _guard = self.lock.lock().await;
        let server_url = normalize_server(&server_url)?;
        let mut config = read_config(&self.file)?;
        config.enabled = enabled;
        config.server_url = server_url;
        if enabled && config.token.is_none() {
            config.token = Some(generate_token()?);
        }
        write_config(&self.file, &config)?;
        Ok(config.settings())
    }

    pub async fn publish(&self, index_file: &Mutex<PathBuf>) -> Result<Option<String>, String> {
        let _guard = self.lock.lock().await;
        let config = read_config(&self.file)?;
        if !config.enabled {
            return Ok(None);
        }
        // Read after taking the publishing lock so queued saves cannot upload stale snapshots.
        let snapshot = {
            let file = index_file.lock().map_err(|_| "Project storage is busy.")?;
            store::read(&file)?.public_snapshot()
        };
        let token = config
            .token
            .as_ref()
            .ok_or("Publishing token is missing.")?;
        let client = Client::builder()
            .redirect(Policy::none())
            .no_proxy()
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| "Could not initialize publishing.")?;
        let endpoint = format!("{}/documents", config.server_url);
        let send = |method| {
            client
                .request(method, &endpoint)
                .bearer_auth(token)
                .json(&snapshot)
                .send()
        };
        let mut status = send(reqwest::Method::PUT)
            .await
            .map_err(|_| "Could not reach the publishing server.")?
            .status();
        if status == StatusCode::NOT_FOUND {
            status = send(reqwest::Method::POST)
                .await
                .map_err(|_| "Could not reach the publishing server.")?
                .status();
            if status == StatusCode::CONFLICT {
                status = send(reqwest::Method::PUT)
                    .await
                    .map_err(|_| "Could not reach the publishing server.")?
                    .status();
            }
        }
        if status != StatusCode::OK && status != StatusCode::CREATED {
            return Err(format!(
                "Publishing server returned HTTP {}.",
                status.as_u16()
            ));
        }
        Ok(config.settings().public_url)
    }
}

fn normalize_server(value: &str) -> Result<String, String> {
    let url = Url::parse(value.trim()).map_err(|_| "Enter a valid publishing server URL.")?;
    let host = url.host_str().unwrap_or_default().trim_matches(['[', ']']);
    let loopback = host == "localhost" || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback());
    if value.len() > 2048
        || url.host_str().is_none()
        || !(url.scheme() == "https" || (url.scheme() == "http" && loopback))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("Use an HTTPS server URL, or HTTP on localhost for testing. Do not include a path, credentials, or query.".into());
    }
    Ok(url.as_str().trim_end_matches('/').into())
}

fn checksum(random: &str) -> String {
    let sum = Sha256::digest(format!("{CHECKSUM_CONTEXT}{random}").as_bytes());
    URL_SAFE_NO_PAD.encode(&sum[..6])
}

fn generate_token() -> Result<String, String> {
    let mut bytes = [0; 24];
    getrandom::fill(&mut bytes).map_err(|_| "Could not generate a secure publishing token.")?;
    let random = URL_SAFE_NO_PAD.encode(bytes);
    Ok(format!("lp1_{random}{}", checksum(&random)))
}

fn valid_token(token: &str) -> bool {
    token.len() == 44
        && token.starts_with("lp1_")
        && token.as_bytes()[4..]
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-')
        && checksum(&token[4..36]) == token[36..]
}

fn read_config(file: &Path) -> Result<Config, String> {
    let input = match fs::File::open(file) {
        Ok(input) => input,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(_) => return Err("Could not read publishing settings.".into()),
    };
    let mut bytes = Vec::new();
    input
        .take(8193)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read publishing settings.")?;
    let invalid = "Publishing settings are invalid. The original file was not changed.";
    if bytes.len() > 8192 {
        return Err(invalid.into());
    }
    let mut config: Config = serde_json::from_slice(&bytes).map_err(|_| invalid)?;
    config.server_url = normalize_server(&config.server_url).map_err(|_| invalid)?;
    if config
        .token
        .as_ref()
        .is_some_and(|token| !valid_token(token))
        || (config.enabled && config.token.is_none())
    {
        return Err(invalid.into());
    }
    Ok(config)
}

fn write_config(file: &Path, config: &Config) -> Result<(), String> {
    let directory = file.parent().ok_or("Invalid publishing settings path.")?;
    fs::create_dir_all(directory).map_err(|_| "Could not create publishing settings directory.")?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)
        .map_err(|_| "Could not save publishing settings.")?;
    let bytes =
        serde_json::to_vec_pretty(config).map_err(|_| "Could not encode publishing settings.")?;
    temporary
        .write_all(&bytes)
        .map_err(|_| "Could not save publishing settings.")?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|_| "Could not sync publishing settings.")?;
    temporary
        .persist(file)
        .map_err(|_| "Could not save publishing settings.")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tokens_match_the_server_protocol_and_settings_never_expose_them() {
        let token = "lp1_AAECAwQFBgcICQoLDA0ODxAREhMUFRYX5VZh-f0u";
        assert!(valid_token(token));
        assert!(!valid_token(&format!("{token}x")));
        assert!(valid_token(&generate_token().unwrap()));
        let config = Config {
            enabled: true,
            server_url: DEFAULT_SERVER.into(),
            token: Some(token.into()),
        };
        let settings = serde_json::to_value(config.settings()).unwrap();
        assert_eq!(
            settings["publicUrl"],
            "http://127.0.0.1:8080/documents/65f46d9a54c22933cb19564aceaa914d7bba4bcb16d4a9360e3ad6063a39446e"
        );
        assert!(settings.get("token").is_none());
        assert!(!settings.to_string().contains(token));
    }

    #[test]
    fn server_urls_require_tls_except_for_loopback_and_cannot_hide_credentials() {
        for url in [
            DEFAULT_SERVER,
            "http://localhost:8080/",
            "http://[::1]:8080",
            "https://publish.example.com",
        ] {
            assert!(normalize_server(url).is_ok(), "{url}");
        }
        for url in [
            "http://example.com",
            "https://user:secret@example.com",
            "https://example.com/documents",
            "https://example.com?token=secret",
            "https://example.com#secret",
            "file:///tmp/feed",
        ] {
            assert!(normalize_server(url).is_err(), "{url}");
        }
    }

    #[test]
    fn opt_in_is_persistent_private_and_corrupt_settings_are_not_reset() {
        tauri::async_runtime::block_on(async {
            let directory = tempfile::tempdir().unwrap();
            let file = directory.path().join("publishing.json");
            let publisher = Publisher::new(file.clone());
            assert!(!publisher.settings().await.unwrap().enabled);
            assert!(!file.exists());
            publisher
                .configure(true, DEFAULT_SERVER.into())
                .await
                .unwrap();
            let token = read_config(&file).unwrap().token.unwrap();
            publisher
                .configure(false, DEFAULT_SERVER.into())
                .await
                .unwrap();
            publisher
                .configure(true, DEFAULT_SERVER.into())
                .await
                .unwrap();
            assert_eq!(
                read_config(&file).unwrap().token.as_deref(),
                Some(token.as_str())
            );
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                assert_eq!(
                    fs::metadata(&file).unwrap().permissions().mode() & 0o777,
                    0o600
                );
            }
            fs::write(&file, "{corrupt").unwrap();
            assert!(
                publisher
                    .configure(true, DEFAULT_SERVER.into())
                    .await
                    .is_err()
            );
            assert_eq!(fs::read_to_string(&file).unwrap(), "{corrupt");
        });
    }

    #[test]
    #[ignore = "set LOCALIST_PUBLISH_TEST_SERVER to a built local publish-server binary"]
    fn publishes_to_a_real_local_server_without_touching_real_app_data() {
        struct Child(std::process::Child);
        impl Drop for Child {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        tauri::async_runtime::block_on(async {
            let directory = tempfile::tempdir().unwrap();
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            drop(listener);
            let server = format!("http://127.0.0.1:{port}");
            let binary =
                std::env::var("LOCALIST_PUBLISH_TEST_SERVER").expect("test server binary required");
            let mut child = Child(
                std::process::Command::new(binary)
                    .args(["-host", "127.0.0.1", "-port", &port.to_string(), "-data"])
                    .arg(directory.path().join("server-data"))
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .unwrap(),
            );
            let client = Client::builder().no_proxy().build().unwrap();
            let mut ready = false;
            for _ in 0..100 {
                if client.get(format!("{server}/healthz")).send().await.is_ok() {
                    ready = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            assert!(ready, "isolated Go server did not start");
            let index_file = directory.path().join("projects.json");
            let project = |id, public, category| json!({"id": id, "name": id, "path": "/private/local/path", "description": "", "category": category, "status": "progress", "public": public, "tags": [], "repositories": [], "createdAt": "2026-01-01", "updatedAt": "2026-01-01"});
            let index = json!({"projects": [project("shown", true, "Public"), project("hidden", false, "Secret")], "categories": ["Public", "Secret"]});
            store::save(&index_file, serde_json::from_value(index).unwrap()).unwrap();
            let original = fs::read(&index_file).unwrap();
            let file = Mutex::new(index_file.clone());
            let publisher = Publisher::new(directory.path().join("publishing.json"));
            assert!(publisher.publish(&file).await.unwrap().is_none());
            publisher.configure(true, server).await.unwrap();
            let url = publisher.publish(&file).await.unwrap().unwrap();
            let snapshot: serde_json::Value =
                client.get(&url).send().await.unwrap().json().await.unwrap();
            assert_eq!(snapshot["projects"].as_array().unwrap().len(), 1);
            assert!(snapshot["projects"][0].get("path").is_none());
            assert_eq!(snapshot["categories"], json!(["Public"]));
            assert!(!snapshot.to_string().contains("hidden"));
            store::save(
                &index_file,
                serde_json::from_value(json!({"projects": [], "categories": []})).unwrap(),
            )
            .unwrap();
            let saved = fs::read(&index_file).unwrap();
            assert_eq!(publisher.publish(&file).await.unwrap(), Some(url.clone()));
            let snapshot: serde_json::Value =
                client.get(&url).send().await.unwrap().json().await.unwrap();
            assert_eq!(snapshot["projects"], json!([]));
            child.0.kill().unwrap();
            child.0.wait().unwrap();
            assert!(publisher.publish(&file).await.is_err());
            assert_eq!(fs::read(&index_file).unwrap(), saved);
            assert_ne!(original, saved);
        });
    }
}
