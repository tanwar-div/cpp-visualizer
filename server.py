#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PORT = 8080


def run_command(args, cwd, timeout):
    return subprocess.run(
        args,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )


def find_function_lines(source):
    lines = []
    pending_signature = ""
    pending_start = None
    control_words = {"if", "for", "while", "switch", "catch"}
    for line_number, raw_line in enumerate(source.splitlines(), start=1):
        line = raw_line.split("//", 1)[0].strip()
        if not line or line.startswith("#"):
            continue
        if pending_signature:
            pending_signature += " " + line
        elif "(" in line and ")" in line and not line.endswith(";"):
            pending_signature = line
            pending_start = line_number
        else:
            continue

        if "{" not in pending_signature:
            continue

        before_paren = pending_signature.split("(", 1)[0].strip()
        name = before_paren.split()[-1].split("::")[-1] if before_paren else ""
        if name and name not in control_words and not name.startswith("operator"):
            if re.search(r"\b(class|struct|enum|namespace)\b", before_paren) is None:
                lines.append(pending_start or line_number)
        pending_signature = ""
        pending_start = None
    return sorted(set(lines))


def make_gdb_script(source_path, input_path, output_path, result_path, mode, max_steps, function_lines):
    return f"""
import gdb
import json
import os

SOURCE = {str(source_path)!r}
INPUT = {str(input_path)!r}
OUTPUT = {str(output_path)!r}
RESULT = {str(result_path)!r}
MODE = {mode!r}
MAX_STEPS = {int(max_steps)}
FUNCTION_LINES = {function_lines!r}
steps = []

gdb.execute("set pagination off", to_string=True)
gdb.execute("set confirm off", to_string=True)
gdb.execute("set print pretty off", to_string=True)
gdb.execute("set print elements 60", to_string=True)
gdb.execute("set step-mode off", to_string=True)
for pattern in ["/usr/include/*", "/usr/lib/*", "/lib/*"]:
    try:
        gdb.execute("skip -gfile " + pattern, to_string=True)
    except Exception:
        pass


def clean_file(path):
    return os.path.realpath(path) if path else ""


def selected():
    try:
        return gdb.selected_frame()
    except Exception:
        return None


def sal_for(frame):
    try:
        return frame.find_sal()
    except Exception:
        return None


def value_to_string(frame, symbol, block):
    try:
        value = str(frame.read_var(symbol.name, block))
    except Exception:
        try:
            value = str(frame.read_var(symbol.name))
        except Exception as exc:
            return "<not available yet>"
    if "Cannot access memory" in value or "error reading variable" in value:
        return "<not available yet>"
    return value


def locals_for(frame, current_line):
    values = {{}}
    block = None
    try:
        block = frame.block()
    except Exception:
        return values
    seen = set()
    while block:
        for symbol in block:
            name = getattr(symbol, "name", None)
            if not name or name in seen:
                continue
            try:
                interesting = symbol.is_argument or symbol.is_variable
            except Exception:
                interesting = False
            if interesting:
                try:
                    declared_line = int(symbol.line)
                except Exception:
                    declared_line = 0
                try:
                    is_argument = bool(symbol.is_argument)
                except Exception:
                    is_argument = False
                if not is_argument and declared_line and current_line and declared_line >= current_line:
                    continue
                values[name] = value_to_string(frame, symbol, block)
                seen.add(name)
        try:
            block = block.superblock
        except Exception:
            break
    return values


def arguments_for(frame):
    values = {{}}
    block = None
    try:
        block = frame.block()
    except Exception:
        return values
    seen = set()
    while block:
        for symbol in block:
            name = getattr(symbol, "name", None)
            if not name or name in seen:
                continue
            try:
                is_argument = bool(symbol.is_argument)
            except Exception:
                is_argument = False
            if is_argument:
                value = value_to_string(frame, symbol, block)
                if value != "<not available yet>":
                    values[name] = value
                seen.add(name)
        try:
            block = block.superblock
        except Exception:
            break
    return values


def stack_for():
    frames = []
    frame = gdb.newest_frame()
    level = 0
    while frame and level < 18:
        sal = sal_for(frame)
        filename = clean_file(sal.symtab.fullname()) if sal and sal.symtab else ""
        try:
            function_name = frame.name() or "?"
        except Exception:
            function_name = "?"
        if not filename or filename == SOURCE:
            frames.append({{
                "level": level,
                "function": function_name,
                "file": os.path.basename(filename) if filename else "?",
                "line": sal.line if sal else None,
                "args": arguments_for(frame),
            }})
        frame = frame.older()
        level += 1
    return frames


def source_location(frame):
    sal = sal_for(frame)
    filename = clean_file(sal.symtab.fullname()) if sal and sal.symtab else ""
    return filename, sal.line if sal else None


def output_text():
    try:
        with open(OUTPUT, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()[-5000:]
    except FileNotFoundError:
        return ""


def capture(event, reason=""):
    frame = selected()
    if not frame:
        return False
    filename, line = source_location(frame)
    if filename != SOURCE:
        return False
    try:
        function_name = frame.name() or "?"
    except Exception:
        function_name = "?"
    locals_map = locals_for(frame, line)
    locals_map = {{
        key: value
        for key, value in locals_map.items()
        if value != "<not available yet>"
    }}
    watches = {{
        key: value
        for key, value in locals_map.items()
        if "{{" in value or "[" in value or "std::" in value
    }}
    steps.append({{
        "event": event,
        "reason": reason,
        "function": function_name,
        "line": line,
        "locals": locals_map,
        "watches": watches,
        "stack": stack_for(),
        "output": output_text(),
    }})
    return True


def normalize_to_source():
    for _ in range(20):
        frame = selected()
        if not frame:
            return False
        filename, _line = source_location(frame)
        if filename == SOURCE:
            return True
        try:
            gdb.execute("finish", to_string=True)
        except Exception:
            try:
                gdb.execute("next", to_string=True)
            except Exception:
                return False
    return False


try:
    gdb.execute("break main", to_string=True)
    if MODE == "step":
        for line in FUNCTION_LINES:
            try:
                gdb.execute("break " + SOURCE + ":" + str(line), to_string=True)
            except Exception:
                pass
    gdb.execute("run < " + INPUT + " > " + OUTPUT, to_string=True)
    normalize_to_source()
    capture("start", "Stopped at main.")
    command = "step" if MODE == "step" else "next"
    for _ in range(MAX_STEPS - 1):
        try:
            text = gdb.execute(command, to_string=True)
        except Exception as exc:
            capture("stop", "Debugger stopped: " + str(exc))
            break
        if "exited normally" in text or "exited with code" in text:
            steps.append({{
                "event": "exit",
                "reason": text.strip() or "Program exited.",
                "function": "program",
                "line": None,
                "locals": {{}},
                "watches": {{}},
                "stack": [],
                "output": output_text(),
            }})
            break
        if normalize_to_source():
            capture("step", "Executed one debugger " + command + ".")
        else:
            break
finally:
    with open(RESULT, "w", encoding="utf-8") as fh:
        json.dump({{"steps": steps}}, fh)
"""


def build_trace(source, stdin_text, mode, max_steps):
    if not shutil.which("g++"):
        raise RuntimeError("g++ was not found.")
    if not shutil.which("gdb"):
        raise RuntimeError("gdb was not found.")

    mode = "step" if mode == "step" else "next"
    max_steps = max(1, min(int(max_steps or 350), 1000))

    with tempfile.TemporaryDirectory(prefix="cpp_visualizer_") as tmp:
        tmp_path = Path(tmp)
        source_path = tmp_path / "program.cpp"
        exe_path = tmp_path / "program"
        input_path = tmp_path / "stdin.txt"
        output_path = tmp_path / "stdout.txt"
        result_path = tmp_path / "trace.json"
        script_path = tmp_path / "trace_gdb.py"
        function_lines = find_function_lines(source)

        source_path.write_text(source, encoding="utf-8")
        input_path.write_text(stdin_text or "", encoding="utf-8")
        script_path.write_text(
            make_gdb_script(source_path, input_path, output_path, result_path, mode, max_steps, function_lines),
            encoding="utf-8",
        )

        compile_result = run_command(
            ["g++", "-std=c++17", "-g", "-O0", "-Wall", "-Wextra", str(source_path), "-o", str(exe_path)],
            cwd=tmp_path,
            timeout=20,
        )
        if compile_result.returncode != 0:
            raise RuntimeError(compile_result.stderr.strip() or compile_result.stdout.strip() or "Compilation failed.")

        gdb_result = run_command(
            ["gdb", "-q", "--batch", "-x", str(script_path), str(exe_path)],
            cwd=tmp_path,
            timeout=30,
        )
        if not result_path.exists():
            raise RuntimeError(gdb_result.stderr.strip() or gdb_result.stdout.strip() or "GDB did not produce a trace.")

        data = json.loads(result_path.read_text(encoding="utf-8"))
        data["compiler"] = compile_result.stderr
        data["debugger"] = gdb_result.stderr
        return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/trace":
            self.end_json(404, {"error": "Unknown endpoint."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            data = build_trace(
                payload.get("source", ""),
                payload.get("stdin", ""),
                payload.get("mode", "step"),
                payload.get("maxSteps", 350),
            )
            self.end_json(200, data)
        except subprocess.TimeoutExpired:
            self.end_json(400, {"error": "Compile or debug timed out. Try smaller input or fewer steps."})
        except Exception as exc:
            self.end_json(400, {"error": str(exc)})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Serving C++ visualizer on http://127.0.0.1:{PORT}/")
    server.serve_forever()
