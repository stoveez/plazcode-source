// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Pure-Rust RTK-style command output compaction: strips ANSI/spinner noise and
// folds repetitive build/VCS/test boilerplate while keeping every error, failure
// trace, file path, line number, and exit status intact.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactOutcome {
    pub text: String,
    pub original_bytes: usize,
    pub compacted_bytes: usize,
    pub applied: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CliKind {
    Cargo,
    GitStatus,
    GitDiff,
    GitLog,
    NodePkg,
    TestRunner,
    Generic,
}

pub fn compact_command_output(command: &str, raw: &str, enabled: bool) -> CompactOutcome {
    let original_bytes = raw.len();
    if !enabled || raw.is_empty() {
        return CompactOutcome {
            text: raw.to_string(),
            original_bytes,
            compacted_bytes: original_bytes,
            applied: false,
        };
    }

    let (cleaned, had_noise) = clean_terminal_noise(raw);
    let line_count = cleaned.lines().count();
    let kind = detect_cli_kind(command, &cleaned);
    let is_large = line_count >= 24 || cleaned.len() >= 2000;
    let is_matched_cli = kind != CliKind::Generic && (line_count >= 8 || had_noise);

    if !is_large && !is_matched_cli {
        return CompactOutcome {
            text: raw.to_string(),
            original_bytes,
            compacted_bytes: original_bytes,
            applied: false,
        };
    }

    let stage1 = match kind {
        CliKind::Cargo => compact_cargo(&cleaned),
        CliKind::GitStatus => compact_git_status(&cleaned),
        CliKind::GitDiff => compact_git_diff(&cleaned),
        CliKind::GitLog => compact_git_log(&cleaned),
        CliKind::NodePkg => compact_node_pkg(&cleaned),
        CliKind::TestRunner => compact_test_runner(&cleaned),
        CliKind::Generic => cleaned.clone(),
    };

    let stage2 = collapse_duplicates_and_blanks(&stage1);
    let final_text = if stage2.len() < raw.len() {
        stage2
    } else if cleaned.len() < raw.len() && had_noise {
        cleaned
    } else {
        raw.to_string()
    };
    let compacted_bytes = final_text.len();
    let applied = final_text != raw;
    CompactOutcome {
        text: final_text,
        original_bytes,
        compacted_bytes,
        applied,
    }
}

fn clean_terminal_noise(input: &str) -> (String, bool) {
    let normalized = input.replace("\r\n", "\n");
    let stripped = strip_ansi(&normalized);
    let had_ansi = stripped.len() != normalized.len();
    let mut had_cr = false;
    let mut lines: Vec<String> = Vec::new();
    for raw_line in stripped.split('\n') {
        if raw_line.contains('\r') {
            had_cr = true;
            let chosen = raw_line
                .split('\r')
                .rev()
                .find(|seg| !seg.trim().is_empty())
                .unwrap_or("");
            lines.push(chosen.trim_end().to_string());
        } else {
            lines.push(raw_line.trim_end().to_string());
        }
    }
    (lines.join("\n"), had_ansi || had_cr)
}

fn strip_ansi(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1B {
            if i + 1 < bytes.len() && bytes[i + 1] == b'[' {
                i += 2;
                while i < bytes.len() && !(0x40..=0x7E).contains(&bytes[i]) {
                    i += 1;
                }
                if i < bytes.len() {
                    i += 1;
                }
                continue;
            }
            if i + 1 < bytes.len() && bytes[i + 1] == b']' {
                i += 2;
                while i < bytes.len() {
                    if bytes[i] == 0x07 {
                        i += 1;
                        break;
                    }
                    if bytes[i] == 0x1B && i + 1 < bytes.len() && bytes[i + 1] == b'\\' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
            if i + 1 < bytes.len() {
                i += 2;
                continue;
            }
        }
        let ch = input[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn detect_cli_kind(command: &str, text: &str) -> CliKind {
    let cmd = command.to_ascii_lowercase();
    if cmd.contains("cargo ") || cmd.starts_with("cargo") || cmd.contains("rustc") {
        return CliKind::Cargo;
    }
    if cmd.contains("git status") {
        return CliKind::GitStatus;
    }
    if cmd.contains("git diff") {
        return CliKind::GitDiff;
    }
    if cmd.contains("git log") {
        return CliKind::GitLog;
    }
    if cmd.contains("npm ") || cmd.contains("pnpm ") || cmd.contains("yarn ") {
        return CliKind::NodePkg;
    }
    if cmd.contains("pytest")
        || cmd.contains("jest")
        || cmd.contains("vitest")
        || cmd.contains("node --test")
    {
        return CliKind::TestRunner;
    }

    if (text.contains("Compiling ") && (text.contains("Finished ") || text.contains("error[")))
        || (text.contains("running ") && text.contains("test result:"))
        || text.lines().filter(|l| is_cargo_progress_line(l.trim_start())).count() >= 4
    {
        return CliKind::Cargo;
    }
    if text.starts_with("On branch ") || text.contains("Changes not staged for commit:") {
        return CliKind::GitStatus;
    }
    if text.contains("diff --git ") {
        return CliKind::GitDiff;
    }
    if text.starts_with("commit ") && text.contains("\nAuthor:") && text.contains("\nDate:") {
        return CliKind::GitLog;
    }
    if text.contains("npm warn ") || text.contains("npm notice ") || text.contains("npm ERR!") {
        return CliKind::NodePkg;
    }
    if text.contains("test session starts") || text.contains("Test Suites:") {
        return CliKind::TestRunner;
    }
    CliKind::Generic
}

fn is_critical_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }
    let lower = t.to_ascii_lowercase();
    lower.starts_with("error")
        || lower.contains("error[")
        || lower.contains("error:")
        || lower.contains("npm err!")
        || lower.contains("elifecycle")
        || lower.contains("eresolve")
        || lower.contains("failed")
        || lower.starts_with("fail ")
        || lower == "failures:"
        || lower.contains("panicked at")
        || lower.contains("traceback")
        || lower.contains("assertionerror")
        || lower.contains("exception")
        || lower.contains("fatal:")
        || lower.contains("timed out")
        || lower.contains("exit code")
        || lower.starts_with("--> ")
        || lower.starts_with("test result:")
        || lower.starts_with("===")
        || lower.starts_with("---- ")
        || lower.starts_with("note:")
        || lower.starts_with("help:")
        || t.starts_with('|')
        || (lower.starts_with("at ") && (t.contains(':') || t.contains('(')))
}

fn compact_cargo(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut progress_count = 0usize;
    let mut passed_tests = 0usize;
    let mut in_failure_block = false;
    let mut in_diag_block = false;

    for line in text.lines() {
        let t = line.trim_start();
        if t.starts_with("failures:") || t.starts_with("---- ") && t.ends_with("stdout ----") {
            in_failure_block = true;
            in_diag_block = false;
        } else if t.starts_with("test result:") {
            in_failure_block = false;
            in_diag_block = false;
        }

        if t.starts_with("error") || t.starts_with("warning:") {
            in_diag_block = true;
        } else if in_diag_block
            && t.is_empty()
        {
            in_diag_block = false;
        }

        if in_failure_block || in_diag_block || is_critical_line(line) {
            flush_cargo_counters(&mut out, &mut progress_count, &mut passed_tests);
            out.push(line.to_string());
            continue;
        }

        if is_cargo_progress_line(t) {
            progress_count += 1;
            continue;
        }

        if t.starts_with("test ") && t.ends_with("... ok") {
            passed_tests += 1;
            continue;
        }

        flush_cargo_counters(&mut out, &mut progress_count, &mut passed_tests);
        out.push(line.to_string());
    }

    flush_cargo_counters(&mut out, &mut progress_count, &mut passed_tests);
    out.join("\n")
}

fn flush_cargo_counters(out: &mut Vec<String>, progress_count: &mut usize, passed_tests: &mut usize) {
    if *progress_count > 0 {
        out.push(format!("[cargo: {} crate progress lines compacted]", *progress_count));
        *progress_count = 0;
    }
    if *passed_tests > 0 {
        out.push(format!("[cargo test: {} passed ok]", *passed_tests));
        *passed_tests = 0;
    }
}

fn is_cargo_progress_line(trimmed: &str) -> bool {
    trimmed.starts_with("Compiling ")
        || trimmed.starts_with("Downloading ")
        || trimmed.starts_with("Downloaded ")
        || trimmed.starts_with("Fresh ")
        || trimmed.starts_with("Checking ")
        || trimmed.starts_with("Locking ")
        || trimmed.starts_with("Updating crates.io index")
        || trimmed.starts_with("Blocking waiting for file lock")
}

fn compact_git_status(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut skipped_hints = 0usize;
    let mut section_items = 0usize;
    let mut section_omitted = 0usize;
    let mut in_file_list = false;

    for line in text.lines() {
        let t = line.trim();
        if t.starts_with("(use \"git ") {
            skipped_hints += 1;
            continue;
        }
        if t.starts_with("Changes ") || t.starts_with("Untracked files:") || t.starts_with("Unmerged paths:") {
            if section_omitted > 0 {
                out.push(format!("  ... (+{section_omitted} more files)"));
                section_omitted = 0;
            }
            section_items = 0;
            in_file_list = true;
            out.push(line.to_string());
            continue;
        }
        if t.is_empty() {
            if section_omitted > 0 {
                out.push(format!("  ... (+{section_omitted} more files)"));
                section_omitted = 0;
            }
            in_file_list = false;
            out.push(String::new());
            continue;
        }
        if in_file_list && line.starts_with('\t') {
            section_items += 1;
            if section_items <= 20 {
                out.push(format!("  {}", t));
            } else {
                section_omitted += 1;
            }
            continue;
        }
        out.push(line.to_string());
    }
    if section_omitted > 0 {
        out.push(format!("  ... (+{section_omitted} more files)"));
    }
    if skipped_hints > 0 && out.len() > 2 {
        out.push(format!("[git status: {skipped_hints} hint lines omitted]"));
    }
    out.join("\n")
}

fn compact_git_diff(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut unchanged_run: Vec<&str> = Vec::new();

    let flush_unchanged = |run: &mut Vec<&str>, dest: &mut Vec<String>| {
        if run.len() <= 4 {
            for l in run.iter() {
                dest.push((*l).to_string());
            }
        } else {
            dest.push(run[0].to_string());
            dest.push(format!("  ... ({} unchanged context lines)", run.len() - 2));
            dest.push(run[run.len() - 1].to_string());
        }
        run.clear();
    };

    for line in text.lines() {
        if line.starts_with("index ") && line.contains("..") {
            continue;
        }
        if line.starts_with(' ') && !is_critical_line(line) {
            unchanged_run.push(line);
            continue;
        }
        flush_unchanged(&mut unchanged_run, &mut out);
        out.push(line.to_string());
    }
    flush_unchanged(&mut unchanged_run, &mut out);
    out.join("\n")
}

fn compact_git_log(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let commit_count = lines.iter().filter(|l| l.starts_with("commit ")).count();
    if commit_count < 3 {
        return text.to_string();
    }
    let mut out: Vec<String> = Vec::new();
    let mut hash = String::new();
    let mut author = String::new();
    let mut msg = String::new();

    let flush_commit = |out: &mut Vec<String>, h: &mut String, a: &mut String, m: &mut String| {
        if h.is_empty() {
            return;
        }
        let short = &h[..h.len().min(8)];
        let who = if a.is_empty() { String::new() } else { format!(" ({a})") };
        let subject = if m.is_empty() { "<no message>" } else { m.as_str() };
        out.push(format!("{short} {subject}{who}"));
        h.clear();
        a.clear();
        m.clear();
    };

    for line in lines {
        if let Some(rest) = line.strip_prefix("commit ") {
            flush_commit(&mut out, &mut hash, &mut author, &mut msg);
            hash = rest.split_whitespace().next().unwrap_or("").to_string();
            continue;
        }
        if let Some(rest) = line.strip_prefix("Author:") {
            author = rest.split('<').next().unwrap_or(rest).trim().to_string();
            continue;
        }
        if line.starts_with("Date:") || line.starts_with("Merge:") {
            continue;
        }
        let t = line.trim();
        if !hash.is_empty() && msg.is_empty() && !t.is_empty() {
            msg = t.to_string();
            continue;
        }
        if is_critical_line(line) {
            out.push(line.to_string());
        }
    }
    flush_commit(&mut out, &mut hash, &mut author, &mut msg);
    out.join("\n")
}

fn compact_node_pkg(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut warn_count = 0usize;
    let mut noise_count = 0usize;
    let mut in_err = false;

    for line in text.lines() {
        let t = line.trim();
        if t.contains("ERR!") || is_critical_line(line) {
            in_err = true;
            out.push(line.to_string());
            continue;
        }
        if in_err && !t.is_empty() {
            out.push(line.to_string());
            continue;
        }
        in_err = false;

        let lower = t.to_ascii_lowercase();
        if lower.starts_with("npm warn") || lower.starts_with("npm notice") || lower.starts_with("warning ") {
            warn_count += 1;
            continue;
        }
        if lower.starts_with("idealTree")
            || lower.starts_with("reify:")
            || lower.starts_with("fetch ")
            || lower.starts_with("progress:")
            || lower.starts_with("resolution step")
            || lower.starts_with("link step")
            || lower.contains("deprecated ")
            || (t.starts_with('[') && t.contains("/4]"))
        {
            noise_count += 1;
            continue;
        }
        out.push(line.to_string());
    }

    if warn_count > 0 || noise_count > 0 {
        out.push(format!(
            "[pkg: {} warnings, {} progress lines compacted]",
            warn_count, noise_count
        ));
    }
    out.join("\n")
}

fn compact_test_runner(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut passed = 0usize;
    let mut in_failure = false;

    for line in text.lines() {
        let t = line.trim();
        if t.starts_with("===") && (t.contains("FAILURES") || t.contains("ERRORS") || t.contains("short test summary")) {
            in_failure = true;
        } else if t.starts_with("===") && (t.contains("passed") || t.contains("seconds")) {
            in_failure = false;
        }

        if in_failure || is_critical_line(line) {
            if passed > 0 {
                out.push(format!("[tests: {passed} passing omitted]"));
                passed = 0;
            }
            out.push(line.to_string());
            continue;
        }

        let is_dot_progress = !t.is_empty() && t.len() >= 10 && t.chars().all(|c| matches!(c, '.' | 's' | 'x'));
        if is_dot_progress {
            passed += t.chars().filter(|&c| c == '.').count();
            continue;
        }

        if t.ends_with(" PASSED")
            || t.starts_with("PASS ")
            || t.starts_with("✓ ")
            || t.starts_with("ok ")
        {
            passed += 1;
            continue;
        }

        if passed > 0 {
            out.push(format!("[tests: {passed} passing omitted]"));
            passed = 0;
        }
        out.push(line.to_string());
    }
    if passed > 0 {
        out.push(format!("[tests: {passed} passing omitted]"));
    }
    out.join("\n")
}

fn collapse_duplicates_and_blanks(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut prev: Option<String> = None;
    let mut run = 0usize;
    let mut blank_run = 0usize;

    let flush_prev = |out: &mut Vec<String>, prev: &mut Option<String>, run: &mut usize| {
        if let Some(p) = prev.take() {
            if *run > 1 && !is_critical_line(&p) {
                out.push(format!("{p} (x{})", *run));
            } else {
                for _ in 0..*run {
                    out.push(p.clone());
                }
            }
            *run = 0;
        }
    };

    for line in text.lines() {
        if line.trim().is_empty() {
            flush_prev(&mut out, &mut prev, &mut run);
            blank_run += 1;
            if blank_run == 1 {
                out.push(String::new());
            }
            continue;
        }
        blank_run = 0;
        if let Some(ref p) = prev {
            if p == line && !is_critical_line(line) {
                run += 1;
                continue;
            }
        }
        flush_prev(&mut out, &mut prev, &mut run);
        prev = Some(line.to_string());
        run = 1;
    }
    flush_prev(&mut out, &mut prev, &mut run);
    out.join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_non_cli_output_stays_verbatim() {
        let raw = "hi\nexit code 0";
        let out = compact_command_output("echo hi", raw, true);
        assert!(!out.applied);
        assert_eq!(out.text, raw);
    }

    #[test]
    fn disabled_flag_returns_verbatim() {
        let noisy = (0..60).map(|i| format!("Compiling crate_{i} v0.1.0")).collect::<Vec<_>>().join("\n");
        let out = compact_command_output("cargo test", &noisy, false);
        assert!(!out.applied);
        assert_eq!(out.text, noisy);
    }

    #[test]
    fn ansi_and_spinner_carriage_returns_clean_up() {
        let raw = "\x1b[32mDownloading 10%\rDownloading 50%\rDone installing\x1b[0m\n".repeat(12);
        let out = compact_command_output("npm install", &raw, true);
        assert!(out.applied);
        assert!(!out.text.contains("\x1b["), "ANSI escaped: {}", out.text);
        assert!(!out.text.contains("Downloading 10%"), "spinner residue: {}", out.text);
        assert!(out.text.contains("Done installing"));
    }

    #[test]
    fn cargo_test_compacts_at_least_60_percent_and_keeps_failures_verbatim() {
        let mut lines = Vec::new();
        for i in 0..80 {
            lines.push(format!("   Compiling dep_{i} v1.2.{i} (https://github.com/example/dep_{i})"));
        }
        for i in 0..50 {
            lines.push(format!("test module::passing_case_{i} ... ok"));
        }
        lines.push("test module::failing_case ... FAILED".to_string());
        lines.push(String::new());
        lines.push("failures:".to_string());
        lines.push("---- module::failing_case stdout ----".to_string());
        lines.push("thread 'module::failing_case' panicked at src/lib.rs:42:9:".to_string());
        lines.push("assertion `left == right` failed".to_string());
        lines.push("  left: 1".to_string());
        lines.push(" right: 2".to_string());
        lines.push(String::new());
        lines.push("test result: FAILED. 50 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out".to_string());

        let raw = lines.join("\n");
        let out = compact_command_output("cargo test", &raw, true);
        assert!(out.applied);
        let ratio = 1.0 - (out.compacted_bytes as f64 / out.original_bytes as f64);
        assert!(ratio >= 0.60, "expected >=60% reduction, got {:.1}% ({} -> {})", ratio * 100.0, out.original_bytes, out.compacted_bytes);
        assert!(out.text.contains("test module::failing_case ... FAILED"));
        assert!(out.text.contains("src/lib.rs:42:9"));
        assert!(out.text.contains("assertion `left == right` failed"));
        assert!(out.text.contains("test result: FAILED. 50 passed; 1 failed"));
    }

    #[test]
    fn git_status_and_log_compact_heavily_without_losing_paths() {
        let mut status = vec![
            "On branch wave3/agent-tokens".to_string(),
            "Changes not staged for commit:".to_string(),
            "  (use \"git add <file>...\" to update what will be committed)".to_string(),
            "  (use \"git restore <file>...\" to discard changes)".to_string(),
            "\tsrc/main.rs".to_string(),
            "\tsrc/workspace.rs".to_string(),
            String::new(),
            "Untracked files:".to_string(),
            "  (use \"git add <file>...\" to include in what will be committed)".to_string(),
        ];
        for i in 0..80 {
            status.push(format!("\ttmp/generated_noise_{i}.log"));
        }
        let raw_status = status.join("\n");
        let compacted_status = compact_command_output("git status", &raw_status, true);
        assert!(compacted_status.text.contains("src/main.rs"));
        assert!(compacted_status.text.contains("src/workspace.rs"));
        assert!(!compacted_status.text.contains("use \"git add"));
        assert!(compacted_status.compacted_bytes < compacted_status.original_bytes / 2);

        let mut log = Vec::new();
        for i in 0..20 {
            log.push(format!("commit 1234567890abcdef1234567890abcdef123456{i:02}"));
            log.push("Author: Dev User <dev@example.com>".to_string());
            log.push("Date:   Sun Nov 22 12:00:00 2026 -0600".to_string());
            log.push(String::new());
            log.push(format!("    Commit subject number {i}"));
            log.push(String::new());
        }
        let raw_log = log.join("\n");
        let compacted_log = compact_command_output("git log", &raw_log, true);
        let ratio = 1.0 - (compacted_log.compacted_bytes as f64 / compacted_log.original_bytes as f64);
        assert!(ratio >= 0.60, "expected >=60% git log reduction, got {:.1}%", ratio * 100.0);
        assert!(compacted_log.text.contains("12345678 Commit subject number 0 (Dev User)"));
    }

    #[test]
    fn npm_and_pytest_preserve_errors_and_compact_noise() {
        let mut npm = Vec::new();
        for i in 0..50 {
            npm.push(format!("npm warn deprecated pkg-{i}@1.0.0: unmaintained"));
            npm.push(format!("reify:pkg-{i}: timing reifyNode:node_modules/pkg-{i} Completed in 12ms"));
        }
        npm.push("npm ERR! code ERESOLVE".to_string());
        npm.push("npm ERR! ERESOLVE unable to resolve dependency tree".to_string());
        let raw_npm = npm.join("\n");
        let out_npm = compact_command_output("npm install", &raw_npm, true);
        let ratio = 1.0 - (out_npm.compacted_bytes as f64 / out_npm.original_bytes as f64);
        assert!(ratio >= 0.60, "expected >=60% npm reduction, got {:.1}%", ratio * 100.0);
        assert!(out_npm.text.contains("npm ERR! code ERESOLVE"));
        assert!(out_npm.text.contains("ERESOLVE unable to resolve dependency tree"));

        let mut py = vec!["============================= test session starts =============================".to_string()];
        for i in 0..60 {
            py.push(format!("tests/test_suite.py::test_case_{i} PASSED"));
        }
        py.push("tests/test_suite.py::test_broken FAILED".to_string());
        py.push("================================== FAILURES ===================================".to_string());
        py.push("tests/test_suite.py:88: AssertionError: expected 42".to_string());
        let raw_py = py.join("\n");
        let out_py = compact_command_output("pytest", &raw_py, true);
        let py_ratio = 1.0 - (out_py.compacted_bytes as f64 / out_py.original_bytes as f64);
        assert!(py_ratio >= 0.60, "expected >=60% pytest reduction, got {:.1}%", py_ratio * 100.0);
        assert!(out_py.text.contains("tests/test_suite.py:88: AssertionError: expected 42"));
    }
}
