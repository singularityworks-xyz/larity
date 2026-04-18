use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingDetectionHint {
    pub title: String,
    pub context: String,
}

const PROCESS_MARKERS: [(&str, &str); 6] = [
    ("zoom", "Zoom"),
    ("teams", "Microsoft Teams"),
    ("slack", "Slack"),
    ("discord", "Discord"),
    ("meet.google.com", "Google Meet"),
    ("googlemeet", "Google Meet"),
];

fn detect_process_heuristic(process_snapshot: &str) -> Option<MeetingDetectionHint> {
    let lower = process_snapshot.to_lowercase();

    for (marker, title) in PROCESS_MARKERS {
        if lower.contains(marker) {
            return Some(MeetingDetectionHint {
                title: title.to_string(),
                context: format!(
                    "Detected conferencing process marker \"{}\" in the active process list.",
                    marker
                ),
            });
        }
    }

    if lower.contains("google chrome") && lower.contains("meet.google.com") {
        return Some(MeetingDetectionHint {
            title: "Google Meet".to_string(),
            context: "Detected a Chrome process with meet.google.com in args/title snapshot."
                .to_string(),
        });
    }

    None
}

pub fn check_process_or_audio_heuristic() -> Result<Option<MeetingDetectionHint>, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("tasklist")
            .output()
            .map_err(|e| e.to_string())?
    } else {
        Command::new("ps")
            .args(["-axo", "comm,args"])
            .output()
            .map_err(|e| e.to_string())?
    };

    if !output.status.success() {
        return Ok(None);
    }

    let process_snapshot = String::from_utf8_lossy(&output.stdout);
    Ok(detect_process_heuristic(&process_snapshot))
}

#[cfg(test)]
mod tests {
    use super::detect_process_heuristic;

    #[test]
    fn detects_zoom_marker() {
        let hint = detect_process_heuristic("/Applications/zoom.us --something");
        assert!(hint.is_some());
        assert_eq!(hint.unwrap().title, "Zoom");
    }

    #[test]
    fn detects_google_meet_in_chrome_args() {
        let hint =
            detect_process_heuristic("google chrome --app https://meet.google.com/abc-defg-hij");
        assert!(hint.is_some());
        assert_eq!(hint.unwrap().title, "Google Meet");
    }

    #[test]
    fn returns_none_for_unrelated_processes() {
        let hint = detect_process_heuristic("code\nnode\npostgres");
        assert!(hint.is_none());
    }
}
