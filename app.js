const defaultSource = `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<vector<long long>> dp;

    long long solve(int i, vector<int>& nums, string& s, int taken) {
        int n = s.size();

        if (i >= n) return 0;
        if (dp[i][taken] != -1) return dp[i][taken];

        long long ans = solve(i + 1, nums, s, 0);

        if (s[i] == '1' && !taken) {
            long long takeNormal = 1LL * nums[i] + solve(i + 1, nums, s, 0);
            ans = max(ans, takeNormal);
        }

        if (i + 1 < n && s[i + 1] == '1') {
            long long takeUsingNext = 1LL * nums[i] + solve(i + 1, nums, s, 1);
            ans = max(ans, takeUsingNext);
        }

        return dp[i][taken] = ans;
    }

    long long maxTotal(vector<int>& nums, string s) {
        int n = s.size();
        dp.assign(n, vector<long long>(2, -1));
        return solve(0, nums, s, 0);
    }
};

int main() {
    vector<int> nums = {9,2,6,1,6,1,1,5,1};
    string s = "010101101";
    Solution obj;
    cout << obj.maxTotal(nums, s) << endl;
    return 0;
}`;

let trace = [];
let stepIndex = 0;
let playTimer = null;

const els = {
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  playBtn: document.querySelector("#playBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  traceBtn: document.querySelector("#traceBtn"),
  fileInput: document.querySelector("#fileInput"),
  stdinInput: document.querySelector("#stdinInput"),
  stepMode: document.querySelector("#stepMode"),
  sourceEditor: document.querySelector("#sourceEditor"),
  sourceView: document.querySelector("#sourceView"),
  stepCount: document.querySelector("#stepCount"),
  stepTitle: document.querySelector("#stepTitle"),
  stepDetail: document.querySelector("#stepDetail"),
  flowSvg: document.querySelector("#flowSvg"),
  varList: document.querySelector("#varList"),
  stackList: document.querySelector("#stackList"),
  dpTable: document.querySelector("#dpTable"),
  programOutput: document.querySelector("#programOutput"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stopPlay() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  els.playBtn.textContent = "Play";
}

function renderSource(activeLine) {
  const lines = els.sourceEditor.value.split("\n");
  els.sourceView.innerHTML = lines
    .map((line, index) => {
      const lineNo = index + 1;
      const active = lineNo === activeLine ? " active" : "";
      return `<span class="codeLine${active}" data-line="${lineNo}">${escapeHtml(line) || " "}</span>`;
    })
    .join("");
  const activeEl = els.sourceView.querySelector(".codeLine.active");
  if (activeEl) activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
}

function frameKey(frame) {
  return `${frame.level}:${frame.function}:${frame.line}`;
}

function graphFromStack(step) {
  const stack = [...step.stack].reverse();
  const nodes = stack.map((frame, index) => ({
    id: frameKey(frame),
    function: frame.function,
    line: frame.line,
    level: frame.level,
    active: index === stack.length - 1,
    x: 80 + index * 150,
    y: 88,
  }));
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    edges.push({ from: nodes[i], to: nodes[i + 1] });
  }
  return { nodes, edges };
}

function renderFlow(step) {
  const { nodes, edges } = graphFromStack(step);
  const width = Math.max(820, 180 + nodes.length * 150);
  els.flowSvg.setAttribute("viewBox", `0 0 ${width} 360`);
  const marker = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb"></path>
      </marker>
    </defs>`;
  const edgeMarkup = edges
    .map(({ from, to }) => {
      const x1 = from.x + 118;
      const y1 = from.y + 25;
      const x2 = to.x;
      const y2 = to.y + 25;
      return `<path class="edge active" d="M ${x1} ${y1} C ${x1 + 35} ${y1}, ${x2 - 35} ${y2}, ${x2} ${y2}" marker-end="url(#arrow)"></path>`;
    })
    .join("");
  const nodeMarkup = nodes
    .map((node) => `
      <g class="node ${node.active ? "active" : ""}" transform="translate(${node.x}, ${node.y})">
        <rect width="118" height="52" rx="7"></rect>
        <text x="10" y="20">${escapeHtml(node.function).slice(0, 15)}</text>
        <text x="10" y="39">line ${node.line || "?"}</text>
      </g>`)
    .join("");
  const legend = `
    <text class="edgeLabel" x="80" y="210">Arrows show caller -> current callee from the debugger call stack.</text>
    <text class="edgeLabel" x="80" y="232">Use "Step into calls" to see data flow across functions; "Step over" stays in the current function.</text>`;
  els.flowSvg.innerHTML = marker + edgeMarkup + nodeMarkup + legend;
}

function renderVars(step, previousStep) {
  const previous = previousStep?.locals || {};
  const entries = Object.entries(step.locals || {});
  els.varList.innerHTML = entries.length
    ? entries
        .map(([key, value]) => {
          const changed = !sameValue(value, previous[key]);
          return `<div class="kv ${changed ? "changed" : ""}"><span class="key">${escapeHtml(key)}</span><span class="value">${escapeHtml(value)}</span></div>`;
        })
        .join("")
    : `<div class="kv"><span class="key">locals</span><span class="value">none visible</span></div>`;
}

function renderStack(step) {
  els.stackList.innerHTML = step.stack.length
    ? step.stack
        .map((frame, index) => `<div class="frame ${index === 0 ? "active" : ""}"><strong>${escapeHtml(frame.function)}</strong><small>${escapeHtml(frame.file)}:${frame.line || "?"}</small></div>`)
        .join("")
    : `<div class="frame"><strong>Program stopped</strong><small>No active frame.</small></div>`;
}

function renderMemory(step, previousStep) {
  const entries = Object.entries(step.watches || {});
  const previous = previousStep?.watches || {};
  if (!entries.length) {
    els.dpTable.innerHTML = `<div class="kv"><span class="key">watch</span><span class="value">No vectors or arrays visible in this frame.</span></div>`;
    return;
  }
  els.dpTable.innerHTML = entries
    .map(([key, value]) => {
      const changed = !sameValue(value, previous[key]);
      return `<div class="kv ${changed ? "changed" : ""}"><span class="key">${escapeHtml(key)}</span><span class="value">${escapeHtml(value)}</span></div>`;
    })
    .join("");
}

function render() {
  const step = trace[stepIndex];
  const previousStep = trace[stepIndex - 1];
  if (!step) {
    els.stepCount.textContent = "No trace";
    els.stepTitle.textContent = "Build a trace";
    els.stepDetail.textContent = "Load or paste a C++ file, then click Build Trace.";
    renderSource(null);
    return;
  }
  els.stepCount.textContent = `Step ${stepIndex + 1} / ${trace.length}`;
  els.stepTitle.textContent = `${step.event}: ${step.function || "program"}`;
  els.stepDetail.textContent = step.reason || `Stopped at line ${step.line || "?"}.`;
  els.prevBtn.disabled = stepIndex === 0;
  els.nextBtn.disabled = stepIndex === trace.length - 1;
  renderSource(step.line);
  renderFlow(step);
  renderVars(step, previousStep);
  renderStack(step);
  renderMemory(step, previousStep);
  els.programOutput.textContent = step.output || "";
}

async function buildTrace() {
  stopPlay();
  els.traceBtn.disabled = true;
  els.traceBtn.textContent = "Building...";
  els.stepTitle.textContent = "Compiling and tracing";
  els.stepDetail.textContent = "The backend is using g++ and GDB to collect line-by-line state.";
  try {
    const response = await fetch("/api/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: els.sourceEditor.value,
        stdin: els.stdinInput.value,
        mode: els.stepMode.value,
        maxSteps: 350,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Trace failed");
    trace = data.steps;
    stepIndex = 0;
    render();
  } catch (error) {
    trace = [];
    els.stepCount.textContent = "Trace failed";
    els.stepTitle.textContent = "Could not build trace";
    els.stepDetail.textContent = error.message;
  } finally {
    els.traceBtn.disabled = false;
    els.traceBtn.textContent = "Build Trace";
  }
}

els.prevBtn.addEventListener("click", () => {
  stopPlay();
  stepIndex = Math.max(0, stepIndex - 1);
  render();
});

els.nextBtn.addEventListener("click", () => {
  stopPlay();
  stepIndex = Math.min(trace.length - 1, stepIndex + 1);
  render();
});

els.resetBtn.addEventListener("click", () => {
  stopPlay();
  stepIndex = 0;
  render();
});

els.playBtn.addEventListener("click", () => {
  if (playTimer) {
    stopPlay();
    return;
  }
  els.playBtn.textContent = "Pause";
  playTimer = setInterval(() => {
    if (stepIndex >= trace.length - 1) {
      stopPlay();
      return;
    }
    stepIndex += 1;
    render();
  }, 700);
});

els.traceBtn.addEventListener("click", buildTrace);

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  els.sourceEditor.value = await file.text();
  trace = [];
  stepIndex = 0;
  render();
});

els.sourceEditor.value = defaultSource;
render();
