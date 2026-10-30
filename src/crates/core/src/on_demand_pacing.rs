//! Cursor on-demand spend pacing helpers (today's usage from quota samples).
use chrono::{Local, TimeZone};

/// Whether a quota row is Cursor's on-demand window.
pub(crate) fn is_cursor_on_demand(row: &serde_json::Value) -> bool {
    row["vendor"] == "cursor"
        && (row["shortLabel"] == "On-demand"
            || row["name"] == "On-demand usage"
            || row["legacyWindowId"]
                .as_str()
                .is_some_and(|id| id.ends_with("/cursor:extra")))
}

/// On-demand dollars used since local midnight, from quota samples (remaining
/// percent) and the dashboard's current `used`/`limit`. None when no sample
/// anchors the day.
pub(crate) fn today_used(
    used: f64,
    limit: f64,
    samples: &[(i64, f64)],
    now_ms: i64,
) -> Option<f64> {
    if !(used.is_finite() && used >= 0.0 && limit.is_finite() && limit > 0.0) {
        return None;
    }
    let local = Local.timestamp_millis_opt(now_ms).single()?;
    let start = local.date_naive().and_hms_opt(0, 0, 0)?;
    let start_ms = start.and_local_timezone(Local).single()?.timestamp_millis();
    let used_at = |remaining_pct: f64| (100.0 - remaining_pct).max(0.0) / 100.0 * limit;
    let before = samples.iter().filter(|(at, _)| *at < start_ms).last();
    let first_today = samples.iter().find(|(at, _)| *at >= start_ms);
    let anchor = before.or(first_today)?;
    Some((used - used_at(anchor.1)).max(0.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_usage_needs_a_sample_anchor() {
        assert!(today_used(5.0, 10.0, &[], 0).is_none());
    }

    #[test]
    fn today_usage_is_the_change_since_yesterdays_reading() {
        let noon = chrono::Local
            .with_ymd_and_hms(2026, 10, 30, 12, 0, 0)
            .unwrap()
            .timestamp_millis();
        let morning = noon - 4 * 3_600_000;
        let yesterday = noon - 20 * 3_600_000;
        // remaining 90% -> used $1 on a $10 cap; now used $2.5
        let samples = [(yesterday, 90.0), (morning, 85.0)];
        assert!((today_used(2.5, 10.0, &samples, noon).unwrap() - 1.5).abs() < 1e-9);
    }
}
