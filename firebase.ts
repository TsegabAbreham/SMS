// firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAXVHOwB3gC2wrl0LdFTq1C6jqlLjDPr5E",
  authDomain: "sms-school-cddaa.firebaseapp.com",
  projectId: "sms-school-cddaa",
  storageBucket: "sms-school-cddaa.appspot.com",
  messagingSenderId: "220306011200",
  appId: "1:220306011200:web:4b4dd9cd6ecc214508dba5",
  measurementId: "G-Y2Z583K4T3"
};

const app = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
