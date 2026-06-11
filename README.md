# C++ Data Flow Visualizer

An interactive, browser-based debugger that lets you step through C++ programs line by line and watch recursive calls, memoization table writes, variable changes, and the call stack — all rendered as a live call graph.

<img width="800" height="450" alt="makegif-ezgif com-video-to-gif-converter" src="https://github.com/user-attachments/assets/1d39f064-cc29-41a4-83ee-1379c9c31f57" />


---

## How It Works

1. Paste or load a `.cpp` file in the browser editor.
2. Click **Build Trace** — the Python server compiles your code with `g++` and runs it under `gdb`, collecting a snapshot of variables, the call stack, and program output at each step.
3. Step forward/backward through execution, or hit **Play** for automatic playback.

The backend pipes the full GDB Python API to extract locals, arguments, watched data structures, and stack frames — no manual instrumentation of your source code is required.

---

## Features

- **Line-by-line stepping** — step into or step over function calls
- **Live call graph** — SVG visualization of the current call stack with argument labels and local variable values per frame
- **Variable change tracking** — variables that changed since the last step are highlighted in amber
- **Watched data panel** — vectors, arrays, and `std::` containers are automatically surfaced
- **Program output panel** — see `stdout` as it appears at each step
- **Stdin support** — pass optional input to your program before tracing
- **Load `.cpp` files** — drag in any `.cpp`, `.cc`, `.cxx`, or `.txt` file
- **Play/pause** — auto-advance through steps at 700 ms intervals

---

## Prerequisites

You need the following installed on your machine:

| Tool | Purpose | Install |
|------|---------|---------|
| **Python 3.7+** | Runs the local HTTP server | [python.org](https://www.python.org/downloads/) |
| **g++** | Compiles your C++ source with debug symbols | Via your system's package manager (see below) |
| **gdb** | Debugs and traces execution | Via your system's package manager (see below) |

### Installing g++ and gdb

**macOS**
```bash
xcode-select --install          # installs clang/g++ and lldb; for gdb:
brew install gdb                # then follow Homebrew's code-signing instructions
```
> Note: GDB on macOS requires code-signing. Follow [these steps](https://sourceware.org/gdb/wiki/PermissionsDarwin) after installing.

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install g++ gdb
```

**Fedora / RHEL**
```bash
sudo dnf install gcc-c++ gdb
```

**Windows**
Install [MSYS2](https://www.msys2.org/), then in its terminal:
```bash
pacman -S mingw-w64-x86_64-gcc mingw-w64-x86_64-gdb
```
Add the MSYS2 `mingw64/bin` directory to your `PATH`.

---

## Running Locally

1. **Clone or download** the project so all four files are in the same folder:
   ```
   project/
   ├── index.html
   ├── styles.css
   ├── app.js
   └── server.py
   ```

2. **Start the server:**
   ```bash
   python3 server.py
   ```
   You should see:
   ```
   Serving C++ visualizer on http://127.0.0.1:8080/
   ```

3. **Open the app** in your browser:
   ```
   http://127.0.0.1:8080/
   ```

4. The editor comes preloaded with a memoized DP example. Click **Build Trace** to compile it and start stepping.

---

## Usage

### Building a Trace

| Control | Description |
|---------|-------------|
| **Load .cpp** | Open a C++ file from disk |
| **stdin input** | Optional text passed to your program's standard input |
| **Step mode** | *Step into calls* traces inside every function; *Step over calls* stays at the top level |
| **Build Trace** | Compiles with `g++ -std=c++17 -g -O0` and collects up to 350 debugger steps |

### Navigating Steps

| Button | Keyboard | Description |
|--------|----------|-------------|
| **Previous Step** | — | Go back one step |
| **Next Step** | — | Go forward one step |
| **Play / Pause** | — | Auto-advance at 700 ms per step |
| **Reset** | — | Jump to step 1 |
| **Fullscreen** | `Esc` to exit | Expand the call graph to fill the window |

### Reading the Visualizer

- **Call graph (SVG)** — each box is a stack frame. The active frame (currently executing) has a blue border. Arrow labels show the arguments passed into a call; box contents show that frame's current local variables.
- **Current Variables** — all locals and arguments in the active frame. Amber highlight = changed since the previous step.
- **Call Stack** — the raw frame list from GDB, newest frame on top.
- **Watched Data** — any variable whose value contains `{`, `[`, or `std::` (vectors, arrays, maps, etc.) is surfaced here, also highlighted when changed.
- **Program Output** — the last 5 000 characters written to `stdout` so far.

---

## Configuration

The server exposes one tunable at the top of `server.py`:

```python
PORT = 8080   # Change if 8080 is already in use
```

The frontend caps traces at **350 steps** (`maxSteps: 350` in `app.js`). The server will accept any value between 1 and 1000 — increase it for longer programs, but expect slower trace builds.

---

## Project Structure

```
index.html   — Single-page UI (source editor, controls, SVG graph, state panels)
styles.css   — All styling; uses CSS custom properties for theming
app.js       — Frontend logic: trace playback, SVG rendering, DOM updates
server.py    — Python HTTP server; compiles C++ with g++ and traces with GDB
```

The server only accepts POST requests to `/api/trace`. Everything else is served as static files from the same directory.

---

## Limitations & Known Issues

- **GDB on macOS requires code-signing** — without it, GDB will fail to attach to processes. See [Homebrew GDB instructions](https://sourceware.org/gdb/wiki/PermissionsDarwin).
- **Compile/trace timeout** — compilation is limited to 20 seconds and GDB tracing to 30 seconds. Programs with very large inputs or very deep recursion may time out.
- **Template-heavy or STL-internal code** — GDB skips `/usr/include/*` and `/usr/lib/*` by default to avoid stepping into standard library internals.
- **Max 350 steps by default** — infinite loops or very long programs will be cut off.
- **No Windows native support** — the server uses POSIX subprocess calls; MSYS2 or WSL are the recommended paths on Windows.

---

## License

MIT — do whatever you like with it.
