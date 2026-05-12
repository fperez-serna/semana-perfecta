const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCxxmNldj0YkVdwTcmFOTAM2yeHAazJ2kY",
  authDomain: "semana-perfecta.firebaseapp.com",
  projectId: "semana-perfecta",
  storageBucket: "semana-perfecta.firebasestorage.app",
  messagingSenderId: "811081789795",
  appId: "1:811081789795:web:1a71ba5d4a2eec41376356"
};

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
