'use strict';
// =============================================================
// Supabase 接続設定
// -------------------------------------------------------------
// Supabase の管理画面 → Project Settings → API でコピーした値に
// 書き換えてください。ここに入れる anon key は「公開してOK」な
// 鍵です（行レベルセキュリティ=RLS でデータは守られます）。
//
// ※ ログインID・パスワードはここには書きません。
//    アプリのログイン画面で毎回入力します。
// =============================================================
window.SUPABASE_CONFIG = {
  url: 'https://pywsrbnrazuctagqcxvq.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5d3NyYm5yYXp1Y3RhZ3FjeHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODMyODcsImV4cCI6MjA5Nzg1OTI4N30._VDTANDT7vYhaJ8xy9OGwmWmQbKr2hPpv2GrZXzpv8g',
};
