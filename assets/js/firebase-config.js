// ============================================================
//  Firebase 設定（請依 README「Firebase 設定步驟」填入）
//  這些值本來就會出現在前端，可以公開；資料安全由 firestore.rules 把關。
// ============================================================
export const firebaseConfig = {
  apiKey: 'AIzaSyB8bn1DyRJskBZzKILdXAPbyauKMQR8kj8',
  authDomain: 'hccforum2026.firebaseapp.com',
  projectId: 'hccforum2026',
  storageBucket: 'hccforum2026.firebasestorage.app',
  messagingSenderId: '942686353102',
  appId: '1:942686353102:web:bde9790ce503095785829f',
};

// 後台管理者帳號（固定），後台登入時只需輸入密碼。
// 若修改這個信箱，firestore.rules 裡的 ADMIN_EMAIL 也要一起改。
export const ADMIN_EMAIL = 'hccforum2026-admin@example.com';
