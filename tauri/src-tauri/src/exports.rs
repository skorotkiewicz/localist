use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub fn write(directory: &Path, name: &str, content: &str) -> Result<PathBuf, String> {
    let (stem, extension) = match name {
        "projects.json" => ("projects", "json"),
        "showcase.html" => ("showcase", "html"),
        _ => return Err("Unsupported export filename.".into()),
    };
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    temporary
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    let mut number = 0u64;
    loop {
        let filename = if number == 0 {
            name.to_owned()
        } else {
            format!("{stem} ({number}).{extension}")
        };
        let path = directory.join(filename);
        match temporary.persist_noclobber(&path) {
            Ok(_) => return Ok(path),
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                temporary = error.file;
                number += 1;
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_to_real_files_without_overwriting_previous_exports() {
        let directory = tempfile::tempdir().unwrap();
        for (number, content) in ["first export", "second export", "third export"]
            .iter()
            .enumerate()
        {
            let path = write(directory.path(), "projects.json", content).unwrap();
            let expected = if number == 0 {
                "projects.json".into()
            } else {
                format!("projects ({number}).json")
            };
            assert_eq!(path, directory.path().join(expected));
            assert_eq!(fs::read_to_string(path).unwrap(), *content);
        }
        assert_eq!(
            fs::read_to_string(directory.path().join("projects.json")).unwrap(),
            "first export"
        );
        let html = "<!doctype html><title>Localist</title>";
        let path = write(directory.path(), "showcase.html", html).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), html);
    }

    #[test]
    fn rejects_other_paths_and_reports_write_failures() {
        let directory = tempfile::tempdir().unwrap();
        for name in ["../projects.json", "/tmp/projects.json", "arbitrary.txt"] {
            assert!(write(directory.path(), name, "data").is_err());
        }
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
        let blocked = directory.path().join("not-a-folder");
        fs::write(&blocked, "keep me").unwrap();
        assert!(write(&blocked, "projects.json", "data").is_err());
        assert_eq!(fs::read_to_string(blocked).unwrap(), "keep me");
    }
}
