use serde::Serialize;
use std::fs::File;
use std::io;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StdinSpec {
    // Inherit stdin from the parent process.
    Inherit,
    // Read stdin from the given file path.
    File(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StdoutSpec {
    // Inherit stdout from the parent process.
    Inherit,
    // Capture stdout into the command output.
    Capture,
    // Write stdout to the given file path.
    File(PathBuf),
}

#[derive(Debug, Clone)]
pub struct CommandSpec {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub working_dir: Option<PathBuf>,
    pub stdin: StdinSpec,
    pub stdout: StdoutSpec,
}

impl CommandSpec {
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            env: Vec::new(),
            working_dir: None,
            stdin: StdinSpec::Inherit,
            stdout: StdoutSpec::Inherit,
        }
    }

    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }

    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.args.extend(args.into_iter().map(Into::into));
        self
    }

    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }

    pub fn working_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.working_dir = Some(dir.into());
        self
    }

    pub fn stdin_file(mut self, path: impl Into<PathBuf>) -> Self {
        self.stdin = StdinSpec::File(path.into());
        self
    }

    pub fn stdout_file(mut self, path: impl Into<PathBuf>) -> Self {
        self.stdout = StdoutSpec::File(path.into());
        self
    }

    pub fn capture_stdout(mut self) -> Self {
        self.stdout = StdoutSpec::Capture;
        self
    }

    pub fn inherit_stdout(mut self) -> Self {
        self.stdout = StdoutSpec::Inherit;
        self
    }
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub status_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl From<std::process::Output> for CommandOutput {
    fn from(output: std::process::Output) -> Self {
        Self {
            status_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommandError {
    Io {
        operation: String,
        path: String,
        message: String,
    },
    Spawn {
        program: String,
        args: Vec<String>,
        message: String,
    },
    NonZeroExit {
        program: String,
        args: Vec<String>,
        status_code: Option<i32>,
        stdout: String,
        stderr: String,
    },
}

pub struct CommandIo {
    pub stdin: Option<Stdio>,
    pub stdout: Option<Stdio>,
    pub capture_stdout: bool,
}

pub trait CommandRunner {
    fn run(&self, spec: &CommandSpec, io: CommandIo) -> Result<CommandOutput, io::Error>;
}

pub struct SystemCommandRunner;

impl CommandRunner for SystemCommandRunner {
    fn run(&self, spec: &CommandSpec, io: CommandIo) -> Result<CommandOutput, io::Error> {
        let mut command = Command::new(&spec.program);
        command.args(&spec.args);

        if let Some(working_dir) = &spec.working_dir {
            command.current_dir(working_dir);
        }

        for (key, value) in &spec.env {
            command.env(key, value);
        }

        if let Some(stdin) = io.stdin {
            command.stdin(stdin);
        }

        if io.capture_stdout {
            command.stderr(Stdio::piped());
            let output = command.output()?;
            return Ok(CommandOutput::from(output));
        }

        if let Some(stdout) = io.stdout {
            command.stdout(stdout);
        }

        command.stderr(Stdio::piped());
        let output = command.spawn()?.wait_with_output()?;
        Ok(CommandOutput::from(output))
    }
}

pub fn run_with_io<R: CommandRunner>(
    spec: &CommandSpec,
    runner: &R,
) -> Result<CommandOutput, CommandError> {
    let stdin = match &spec.stdin {
        StdinSpec::Inherit => None,
        StdinSpec::File(path) => {
            let file = File::open(path).map_err(|source| CommandError::Io {
                operation: "open stdin".to_string(),
                path: path.display().to_string(),
                message: source.to_string(),
            })?;
            Some(Stdio::from(file))
        }
    };

    let (stdout, capture_stdout) = match &spec.stdout {
        StdoutSpec::Inherit => (None, false),
        StdoutSpec::Capture => (None, true),
        StdoutSpec::File(path) => {
            let file = File::create(path).map_err(|source| CommandError::Io {
                operation: "create stdout".to_string(),
                path: path.display().to_string(),
                message: source.to_string(),
            })?;
            (Some(Stdio::from(file)), false)
        }
    };

    let output = runner
        .run(
            spec,
            CommandIo {
                stdin,
                stdout,
                capture_stdout,
            },
        )
        .map_err(|source| CommandError::Spawn {
            program: spec.program.display().to_string(),
            args: spec.args.clone(),
            message: source.to_string(),
        })?;

    if output.status_code == Some(0) {
        Ok(output)
    } else {
        Err(CommandError::NonZeroExit {
            program: spec.program.display().to_string(),
            args: spec.args.clone(),
            status_code: output.status_code,
            stdout: output.stdout,
            stderr: output.stderr,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct FakeRunner {
        output: CommandOutput,
        call_count: Cell<usize>,
    }

    impl FakeRunner {
        fn new(output: CommandOutput) -> Self {
            Self {
                output,
                call_count: Cell::new(0),
            }
        }
    }

    impl CommandRunner for FakeRunner {
        fn run(&self, _spec: &CommandSpec, _io: CommandIo) -> Result<CommandOutput, io::Error> {
            self.call_count.set(self.call_count.get() + 1);
            Ok(self.output.clone())
        }
    }

    fn unique_temp_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("hdricalibrationtool-{label}-{nanos}"))
    }

    #[test]
    fn stdin_missing_returns_io_error() {
        let missing_path = unique_temp_path("missing-stdin");
        let spec = CommandSpec::new("fake").stdin_file(missing_path);
        let runner = FakeRunner::new(CommandOutput {
            status_code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
        });

        let result = run_with_io(&spec, &runner);
        assert!(matches!(result, Err(CommandError::Io { .. })));
        assert_eq!(runner.call_count.get(), 0);
    }

    #[test]
    fn stdout_invalid_path_returns_io_error() {
        let invalid_path = unique_temp_path("missing-dir").join("out.hdr");
        let spec = CommandSpec::new("fake").stdout_file(invalid_path);
        let runner = FakeRunner::new(CommandOutput {
            status_code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
        });

        let result = run_with_io(&spec, &runner);
        assert!(matches!(result, Err(CommandError::Io { .. })));
        assert_eq!(runner.call_count.get(), 0);
    }

    #[test]
    fn non_zero_exit_returns_rich_error() {
        let spec = CommandSpec::new("fake").capture_stdout();
        let runner = FakeRunner::new(CommandOutput {
            status_code: Some(3),
            stdout: "stdout".to_string(),
            stderr: "stderr".to_string(),
        });

        let result = run_with_io(&spec, &runner);
        match result {
            Err(CommandError::NonZeroExit {
                status_code,
                stdout,
                stderr,
                ..
            }) => {
                assert_eq!(status_code, Some(3));
                assert_eq!(stdout, "stdout");
                assert_eq!(stderr, "stderr");
            }
            _ => panic!("expected NonZeroExit error"),
        }
        assert_eq!(runner.call_count.get(), 1);
    }

    #[test]
    fn success_returns_output() {
        let spec = CommandSpec::new("fake").inherit_stdout();
        let runner = FakeRunner::new(CommandOutput {
            status_code: Some(0),
            stdout: "ok".to_string(),
            stderr: String::new(),
        });

        let result = run_with_io(&spec, &runner).expect("expected success");
        assert_eq!(result.status_code, Some(0));
        assert_eq!(result.stdout, "ok");
        assert_eq!(runner.call_count.get(), 1);
    }
}
