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

function compactValue(value) {
  return String(value ?? "")
    .replace(/^std::vector of length \d+, capacity \d+ = /, "")
    .replace(/^"([\s\S]{0,42})[\s\S]*"$/, '"$1"')
    .replace(/\s+/g, " ");
}

function formatValueParts(values, limit = 3) {
  const entries = Object.entries(values || {}).filter(([key]) => key !== "this");
  const visible = entries
    .slice(0, limit)
    .map(([key, value]) => `${key}=${compactValue(value)}`);
  if (entries.length > limit) visible.push("...");
  return visible;
}

function wrapText(text, maxChars = 30, maxLines = 2) {
  const words = String(text || "").split(/(\s+|,\s*)/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line + word;
    if (next.length > maxChars && line) {
      lines.push(line.trim().replace(/,$/, ""));
      line = word.trimStart();
    } else {
      line = next;
    }
  });
  if (line.trim()) lines.push(line.trim().replace(/,$/, ""));
  if (!lines.length) return [];
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/\s*\.\.\.$/, "")} ...`;
    return clipped;
  }
  return lines;
}

function formatValues(values, limit = 3, maxChars = 30, maxLines = 2) {
  return wrapText(formatValueParts(values, limit).join(", "), maxChars, maxLines);
}

function estimateBoxSize(title, valueLines) {
  const longest = [title, ...valueLines].reduce((max, line) => Math.max(max, line.length), 0);
  return {
    width: Math.min(320, Math.max(142, longest * 7.2 + 24)),
    height: Math.max(58, 34 + valueLines.length * 17),
  };
}

function graphFromStack(step) {
  const stack = [...step.stack].reverse();
  const maxRowWidth = 900;
  const gapX = 64;
  const gapY = 34;
  const left = 70;
  const top = 62;
  const rows = [[]];
  const nodes = stack.map((frame, index) => {
    const values = index === stack.length - 1 ? step.locals || frame.args || {} : frame.args || {};
    const title = frame.function || "program";
    const valueLines = formatValues(values, 3, 34, 3);
    const size = estimateBoxSize(title, valueLines.length ? valueLines : ["no values"]);
    return {
      id: frameKey(frame),
      function: title,
      line: frame.line,
      args: frame.args || {},
      values,
      valueLines: valueLines.length ? valueLines : ["no values"],
      level: frame.level,
      active: index === stack.length - 1,
      width: size.width,
      height: size.height,
      x: 0,
      y: 0,
    };
  });

  nodes.forEach((node) => {
    let row = rows[rows.length - 1];
    const used = row.reduce((sum, item) => sum + item.width, 0) + Math.max(0, row.length - 1) * gapX;
    if (row.length && used + gapX + node.width > maxRowWidth) {
      row = [];
      rows.push(row);
    }
    row.push(node);
  });

  const rowHeights = rows.map((row) => {
    const tallest = row.reduce((max, node) => Math.max(max, node.height), 0);
    return Math.max(72, tallest);
  });

  rows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, node) => sum + node.width, 0) + Math.max(0, row.length - 1) * gapX;
    const leftToRight = rowIndex % 2 === 0;
    const rowY = top + rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height + gapY, 0);
    let cursor = leftToRight ? left : left + maxRowWidth - rowWidth;
    const ordered = leftToRight ? row : [...row].reverse();
    ordered.forEach((node) => {
      node.x = cursor;
      node.y = rowY;
      node.height = rowHeights[rowIndex];
      cursor += node.width + gapX;
    });
  });

  const edges = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    edges.push({ from: nodes[i], to: nodes[i + 1], labelLines: formatValues(nodes[i + 1].args, 3, 28, 2) });
  }
  return { nodes, edges, rows, rowHeights };
}

function renderFlow(step) {
  const { nodes, edges, rowHeights } = graphFromStack(step);
  const width = Math.max(980, ...nodes.map((node) => node.x + node.width + 70));
  const height = Math.max(360, ...nodes.map((node) => node.y + node.height + 96));
  els.flowSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const marker = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb"></path>
      </marker>
    </defs>`;
  const edgeMarkup = edges
    .map(({ from, to, labelLines }) => {
      const fromCenterX = from.x + from.width / 2;
      const fromCenterY = from.y + from.height / 2;
      const toCenterX = to.x + to.width / 2;
      const toCenterY = to.y + to.height / 2;
      const sameRow = Math.abs(from.y - to.y) < 4;
      const fromRight = to.x >= from.x;
      const x1 = fromRight ? from.x + from.width : from.x;
      const y1 = fromCenterY;
      const x2 = fromRight ? to.x : to.x + to.width;
      const y2 = toCenterY;
      const labelX = sameRow ? (x1 + x2) / 2 - 48 : toCenterX - 52;
      const labelY = sameRow ? y1 - 12 : (from.y + from.height + to.y) / 2 - 8;
      const path = sameRow
        ? `M ${x1} ${y1} C ${x1 + (fromRight ? 36 : -36)} ${y1}, ${x2 + (fromRight ? -36 : 36)} ${y2}, ${x2} ${y2}`
        : `M ${fromCenterX} ${from.y + from.height} L ${fromCenterX} ${to.y - 22} L ${toCenterX} ${to.y - 22} L ${toCenterX} ${to.y}`;
      const labelMarkup = (labelLines || [])
        .map((line, index) => `<text class="edgeLabel edgeInput" x="${labelX}" y="${labelY + index * 13}">${escapeHtml(line).slice(0, 34)}</text>`)
        .join("");
      return `
        <path class="edge active" d="${path}" marker-end="url(#arrow)"></path>
        ${labelMarkup}`;
    })
    .join("");
  const nodeMarkup = nodes
    .map((node) => {
      const valueMarkup = node.valueLines
        .map((line, index) => `<text x="10" y="${41 + index * 17}">${escapeHtml(line)}</text>`)
        .join("");
      return `
        <g class="node ${node.active ? "active" : ""}" transform="translate(${node.x}, ${node.y})">
          <rect width="${node.width}" height="${node.height}" rx="7"></rect>
          <text x="10" y="20">${escapeHtml(node.function).slice(0, 32)}</text>
          ${valueMarkup}
        </g>`;
    })
    .join("");
  const legend = `
    <text class="edgeLabel" x="70" y="${height - 42}">Rows use the tallest box height in that row. Arrows turn down, then across, then back up into the next row.</text>
    <text class="edgeLabel" x="70" y="${height - 20}">Arrow labels are input parameters; boxes show current frame values.</text>`;
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
