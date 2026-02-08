import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC1kO3gbJoVSP7ETAiM2u8sPZsecE6n0Xw",
  authDomain: "relay-ai-fb.firebaseapp.com",
  databaseURL: "https://relay-ai-fb-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "relay-ai-fb",
  storageBucket: "relay-ai-fb.firebasestorage.app",
  messagingSenderId: "237863954838",
  appId: "1:237863954838:web:4cf93635eb0b9bb7edd5b7",
  measurementId: "G-BG6GNJ1J6Z"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  client_id: "237863954838-r99edt06emuhdf618q5od2e31avh5m7q.apps.googleusercontent.com"
});

export default app;
