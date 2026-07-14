import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// Public Firebase Web configuration only. Never paste a service-account key here.
// Replace these values only when moving NexCRM to another Firebase project.
export const firebaseConfig = {
  apiKey: "AIzaSyBOzXioyIop1bL0KDARSv9aZjLx9n41N54",
  authDomain: "nexcrm-372c7.firebaseapp.com",
  databaseURL: "https://nexcrm-372c7-default-rtdb.firebaseio.com",
  projectId: "nexcrm-372c7",
  storageBucket: "nexcrm-372c7.firebasestorage.app",
  messagingSenderId: "512061780494",
  appId: "1:512061780494:web:08714220178cc6c7db425f"
};

export const app = getApps()[0] || initializeApp(firebaseConfig);
export const db = getDatabase(app);
