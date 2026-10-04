import { createPublicClient, createWalletClient, http } from "https://esm.sh/viem@2";
import { hardhat } from "https://esm.sh/viem@2/chains";
import { ADDRESSES, RPC_URL } from "./config.js";

const publicClient = createPublicClient({ chain: hardhat, transport: http(RPC_URL) });
const walletClient = createWalletClient({ chain: hardhat, transport: http(RPC_URL) });
const abis = {};

const $ = (id) => document.getElementById(id);
const currentAccount = () => $("account").value;
const errText = (e) => e.shortMessage || e.message || String(e);
const stringify = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

function show(el, msg, cls = "") {
  el.className = "out " + cls;
  el.textContent = msg;
}

function setStatus(connected, text) {
  $("status-dot").className = "dot " + (connected ? "on" : "off");
  $("status-text").textContent = text;
}

const shorten = (a) => a.slice(0, 6) + "..." + a.slice(-4);

async function loadAbi(name) {
  const res = await fetch(`/artifacts/contracts/${name}.sol/${name}.json`);
  if (!res.ok) {
    throw new Error(
      `Could not load the ABI for ${name}. Run "npx hardhat build" and serve from the repo root.`
    );
  }
  return (await res.json()).abi;
}

function parseArg(type, value) {
  if (type.startsWith("uint") || type.startsWith("int")) return BigInt(value);
  if (type === "bool") return value === "true" || value === "1";
  if (type === "address" || type === "string") return value.trim();
  return JSON.parse(value); // arrays and tuples are typed in as JSON
}

async function callContract(name, fn, args = []) {
  const item = abis[name].find((i) => i.type === "function" && i.name === fn);
  const base = { address: ADDRESSES[name], abi: abis[name], functionName: fn, args, account: currentAccount() };
  const isRead = item.stateMutability === "view" || item.stateMutability === "pure";

  if (isRead) {
    return { kind: "read", value: await publicClient.readContract(base) };
  }
  const hash = await walletClient.writeContract(base);
  await publicClient.waitForTransactionReceipt({ hash });
  return { kind: "write", hash };
}

// Section 1
function renderFunctions(name, container) {
  abis[name]
    .filter((i) => i.type === "function")
    .forEach((fn) => {
      const isRead = fn.stateMutability === "view" || fn.stateMutability === "pure";
      const wrap = document.createElement("div");
      wrap.className = "fn";

      const inputs = fn.inputs
        .map(
          (inp, i) =>
            `<div class="field"><label>${inp.name || "arg" + i} (${inp.type})</label><input data-i="${i}"></div>`
        )
        .join("");

      wrap.innerHTML = `
        <h3><span>${name}</span>.${fn.name}</span></h3>
        <div class="row">${inputs}</div>
        <button>${isRead ? "Read" : "Send"}</button>
        <div class="out"></div>`;

      const out = wrap.querySelector(".out");
      wrap.querySelector("button").onclick = async () => {
        try {
          const args = fn.inputs.map((inp, i) =>
            parseArg(inp.type, wrap.querySelector(`[data-i="${i}"]`).value)
          );
          show(out, "working...");
          const r = await callContract(name, fn.name, args);
          show(out, r.kind === "read" ? stringify(r.value) : "Confirmed. tx " + r.hash, "ok");
        } catch (e) {
          show(out, errText(e), "err");
        }
      };
      container.appendChild(wrap);
    });
}

// Section 2
async function consentAction(fn) {
  const out = $("consent-out");
  try {
    const delegate = $("delegate").value.trim();
    show(out, "working...");
    let args;
    if (fn === "hasConsent") args = [currentAccount(), delegate];
    else if (fn === "grant") args = [delegate, BigInt($("duration").value || "0")];
    else args = [delegate];
    const r = await callContract("Consent_manager", fn, args);
    show(out, r.kind === "read" ? "Consent active: " + r.value : "Confirmed. tx " + r.hash, "ok");
  } catch (e) {
    show(out, errText(e), "err");
  }
}

// Section 3
async function requestAccess() {
  const out = $("request-out");
  try {
    show(out, "working...");
    const owner = $("ra-owner").value.trim();
    const device = $("ra-device").value.trim();

    const sim = await publicClient.simulateContract({
      address: ADDRESSES.Data_sharing,
      abi: abis.Data_sharing,
      functionName: "requestAccess",
      args: [owner, device],
      account: currentAccount(),
    });
    await callContract("Data_sharing", "requestAccess", [owner, device]);

    show(
      out,
      sim.result ? "Access GRANTED. The attempt was logged." : "Access DENIED. The attempt was logged.",
      sim.result ? "ok" : "err"
    );
  } catch (e) {
    show(out, errText(e), "err");
  }
}

// Section 4
async function loadLogs() {
  const out = $("log-out");
  const table = $("log-table");
  try {
    show(out, "loading...");
    const r = await callContract("Data_sharing", "getLogs", [$("log-device").value.trim()]);
    const logs = r.value;

    if (!logs.length) {
      show(out, "No access attempts logged for this device yet.");
      table.innerHTML = "";
      return;
    }

    show(out, `${logs.length} ${logs.length === 1 ? "entry" : "entries"}`, "ok");
    table.innerHTML =
      `<table><thead><tr><th>#</th><th>Requester</th><th>Device</th><th>Result</th><th>Time</th></tr></thead><tbody>` +
      logs
        .map(
          (l, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td>${l.requester}</td>
            <td>${l.deviceAddr}</td>
            <td><span class="pill ${l.granted ? "granted" : "denied"}">${l.granted ? "Granted" : "Denied"}</span></td>
            <td>${new Date(Number(l.timestamp) * 1000).toLocaleString()}</td>
          </tr>`
        )
        .join("") +
      `</tbody></table>`;
  } catch (e) {
    show(out, errText(e), "err");
    table.innerHTML = "";
  }
}

// Chips
function renderChips(accounts) {
  const wrap = $("chips");
  wrap.innerHTML = "";
  accounts.forEach((addr, i) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = `#${i} ${shorten(addr)}`;
    b.title = addr;
    b.onclick = async () => {
      await navigator.clipboard.writeText(addr);
      b.classList.add("copied");
      b.textContent = "copied";
      setTimeout(() => {
        b.classList.remove("copied");
        b.textContent = `#${i} ${shorten(addr)}`;
      }, 900);
    };
    wrap.appendChild(b);
  });
}

async function init() {
  try {
    for (const name of Object.keys(ADDRESSES)) abis[name] = await loadAbi(name);

    const accounts = await walletClient.getAddresses();
    $("account").innerHTML = accounts
      .map((a, i) => `<option value="${a}">Account ${i}: ${a}</option>`)
      .join("");
    renderChips(accounts);

    renderFunctions("ID_registery", $("identity-fns"));
    renderFunctions("Device_manager", $("identity-fns"));

    setStatus(true, "connected to local Hardhat node");
  } catch (e) {
    setStatus(false, "not connected");
    const box = document.createElement("div");
    box.className = "out err";
    box.textContent = errText(e);
    $("identity-fns").appendChild(box);
  }
}

$("grant").onclick = () => consentAction("grant");
$("revoke").onclick = () => consentAction("revoke");
$("check").onclick = () => consentAction("hasConsent");
$("request").onclick = requestAccess;
$("load-logs").onclick = loadLogs;

init();
