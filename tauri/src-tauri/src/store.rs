use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::Path,
};

const MAX_BYTES: u64 = 10_000_000;

#[derive(Default, Deserialize, Serialize)]
pub struct Index {
    projects: Vec<Project>,
    categories: Vec<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    path: String,
    description: String,
    category: String,
    status: String,
    public: bool,
    tags: Vec<String>,
    repositories: Vec<String>,
    created_at: String,
    updated_at: String,
    #[serde(default = "folder_icon")]
    icon: String,
}

fn folder_icon() -> String {
    "folder".into()
}

impl Index {
    pub fn public_snapshot(&self) -> serde_json::Value {
        let mut seen = HashSet::new();
        let categories: Vec<_> = self
            .projects
            .iter()
            .filter(|p| p.public)
            .map(|p| &p.category)
            .filter(|category| seen.insert(*category))
            .collect();
        let projects: Vec<_> = self.projects.iter().filter(|p| p.public).map(|p| serde_json::json!({
            "id": p.id, "name": p.name, "description": p.description, "category": p.category,
            "status": p.status, "public": true, "tags": p.tags, "repositories": p.repositories,
            "createdAt": p.created_at, "updatedAt": p.updated_at, "icon": p.icon
        })).collect();
        serde_json::json!({ "projects": projects, "categories": categories })
    }

    fn validate(mut self) -> Result<Self, String> {
        let fits = |text: &str, max| text.encode_utf16().count() <= max;
        let valid_date = |text: &str| {
            chrono::DateTime::parse_from_rfc3339(text).is_ok()
                || chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok()
                || chrono::DateTime::parse_from_rfc2822(text).is_ok()
        };
        if self.projects.len() > 10_000
            || self.categories.len() > 1_000
            || self
                .categories
                .iter()
                .any(|c| c.trim().is_empty() || !fits(c, 60))
        {
            return Err("Invalid project index or categories.".into());
        }
        let mut ids = HashSet::new();
        for p in &self.projects {
            if p.id.is_empty()
                || !ids.insert(&p.id)
                || [&p.name, &p.path, &p.category]
                    .iter()
                    .any(|s| s.trim().is_empty())
                || [&p.name, &p.path, &p.description, &p.category]
                    .iter()
                    .any(|s| !fits(s, 10_000))
                || !matches!(p.status.as_str(), "progress" | "complete" | "archived")
                || p.tags.len() > 30
                || p.tags.iter().any(|s| !fits(s, 100))
                || !valid_date(&p.updated_at)
                || !valid_date(&p.created_at)
            {
                return Err("Invalid project data. Check IDs, names, paths, categories, statuses, tags, and dates.".into());
            }
        }
        let mut categories = HashSet::new();
        self.categories.retain_mut(|category| {
            *category = category.trim().to_owned();
            categories.insert(category.clone())
        });
        Ok(self)
    }
}

pub fn read(file: &Path) -> Result<Index, String> {
    match fs::File::open(file) {
        Ok(input) => {
            let mut bytes = Vec::new();
            input
                .take(MAX_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 > MAX_BYTES {
                return Err("The index must be smaller than 10 MB.".into());
            }
            serde_json::from_slice::<Index>(&bytes)
                .map_err(|e| e.to_string())?
                .validate()
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => write(file, Index::default()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save(file: &Path, index: Index) -> Result<Index, String> {
    read(file)?;
    write(file, index)
}

fn write(file: &Path, index: Index) -> Result<Index, String> {
    let index = index.validate()?;
    let bytes = serde_json::to_vec_pretty(&index).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("The index must be smaller than 10 MB.".into());
    }
    let directory = file.parent().ok_or("Invalid index path.")?;
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    temporary.write_all(&bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(file).map_err(|e| e.to_string())?;
    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> Index {
        serde_json::from_value(json!({"projects": [{
            "id": "test", "name": "Test", "path": "/private/project", "description": "",
            "category": "Custom", "status": "archived", "public": false, "tags": [],
            "repositories": ["not a URL", "private repository"],
            "createdAt": "2026-04-01T00:00:00Z", "updatedAt": "2026-05-01T00:00:00Z"
        }], "categories": ["Custom"]}))
        .unwrap()
    }

    #[test]
    fn public_snapshots_omit_private_records_paths_and_unused_categories() {
        let mut index = sample();
        index.projects[0].public = true;
        index.projects[0].category = "Shared".into();
        let mut hidden = sample();
        hidden.projects[0].id = "hidden-record".into();
        hidden.projects[0].category = "HiddenCategory".into();
        index.projects.extend(hidden.projects);
        index.categories = vec!["Shared".into(), "HiddenCategory".into(), "Unused".into()];
        let original = serde_json::to_string(&index).unwrap();
        let snapshot = index.public_snapshot();
        assert_eq!(snapshot["projects"].as_array().unwrap().len(), 1);
        assert!(snapshot["projects"][0].get("path").is_none());
        assert_eq!(snapshot["categories"], json!(["Shared"]));
        assert!(!snapshot.to_string().contains("hidden-record"));
        assert!(!snapshot.to_string().contains("/private/project"));
        assert_eq!(serde_json::to_string(&index).unwrap(), original);
    }

    #[test]
    fn initializes_empty_and_preserves_projects_on_reload() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("data/projects.json");
        assert!(read(&file).unwrap().projects.is_empty());
        save(&file, sample()).unwrap();
        let reloaded = read(&file).unwrap();
        assert_eq!(
            reloaded.projects[0].repositories,
            ["not a URL", "private repository"]
        );
        assert_eq!(reloaded.projects[0].created_at, "2026-04-01T00:00:00Z");
        assert_eq!(reloaded.projects[0].icon, "folder");
        assert_eq!(reloaded.categories, ["Custom"]);
        save(
            &file,
            Index {
                projects: vec![],
                categories: reloaded.categories,
            },
        )
        .unwrap();
        assert!(read(&file).unwrap().projects.is_empty());
        assert_eq!(read(&file).unwrap().categories, ["Custom"]);
    }

    #[test]
    fn invalid_saves_and_corrupt_files_do_not_replace_existing_data() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("projects.json");
        save(&file, sample()).unwrap();
        let original = fs::read(&file).unwrap();
        let mut invalid = sample();
        invalid.projects[0].updated_at = "invalid date".into();
        assert!(save(&file, invalid).is_err());
        assert_eq!(fs::read(&file).unwrap(), original);
        fs::write(&file, "{broken json").unwrap();
        assert!(read(&file).is_err());
        assert!(save(&file, sample()).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "{broken json");
    }
}
