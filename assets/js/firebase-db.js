import { db } from "./firebase-config.js";
import { ref, set, get, push, update, remove, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const cleanPath = path => String(path || "").replace(/^\/+|\/+$/g, "");
const stamp = () => new Date().toISOString();

export async function createData(path, data) {
  const newRef = push(ref(db, cleanPath(path)));
  const now = stamp();
  await set(newRef, { ...data, id: newRef.key, createdAt: data?.createdAt || now, updatedAt: now });
  return newRef.key;
}
export async function setData(path, data) { await set(ref(db, cleanPath(path)), data); return data; }
export async function readData(path) { const snapshot = await get(ref(db, cleanPath(path))); return snapshot.exists() ? snapshot.val() : null; }
export function listenData(path, callback, onError = console.error) { return onValue(ref(db, cleanPath(path)), snapshot => callback(snapshot.exists() ? snapshot.val() : null), onError); }
export async function updateData(path, data) { await update(ref(db, cleanPath(path)), { ...data, updatedAt: stamp() }); }
export async function deleteData(path) { await remove(ref(db, cleanPath(path))); }

export async function generateLeadId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `NXC${yy}${mm}`;
  const leads = await readData("leads");
  let maxNum = 0;
  if (leads) Object.values(leads).forEach(lead => {
    const id = String(lead?.leadId || lead?.nexId || lead?.NexID || "");
    if (id.startsWith(prefix)) { const n = Number.parseInt(id.slice(prefix.length), 10); if (!Number.isNaN(n)) maxNum = Math.max(maxNum, n); }
  });
  const counter = ref(db, `counters/leadIds/${prefix}`);
  const result = await runTransaction(counter, current => Math.max(Number(current || 0), maxNum) + 1);
  return `${prefix}${String(result.snapshot.val()).padStart(4, "0")}`;
}

export const NexCRMData = { createData, setData, readData, listenData, updateData, deleteData, generateLeadId, db };
window.NexCRMData = NexCRMData;
window.dispatchEvent(new CustomEvent("nexcrm:data-service-ready", { detail: NexCRMData }));
export default NexCRMData;
