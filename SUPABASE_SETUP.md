# クラウド同期（Supabase）セットアップ手順

「あらかじめ決めた1つのID・パスワード」でログインして、データをクラウド（DB）に
自動バックアップする仕組みです。設定しなくてもアプリはこれまで通り端末内で動きます。

所要時間：だいたい10分。

---

## 1. Supabase プロジェクトを作る

1. https://supabase.com にアクセスして無料アカウントを作る（GitHubログイン可）
2. 「New project」でプロジェクトを作成
   - Name: 何でもOK（例: `nomikai`）
   - Database Password: 適当に強いものを設定（DBの管理用。アプリのログインとは別）
   - Region: `Northeast Asia (Tokyo)` がおすすめ
3. 作成完了まで1〜2分待つ

## 2. 接続情報をアプリに設定する

1. 左メニュー **Project Settings（歯車）→ API** を開く
2. 次の2つをコピー
   - **Project URL**（例: `https://abcd1234.supabase.co`）
   - **anon public** キー（`eyJ...` で始まる長い文字列）
3. プロジェクト内の **`supabase-config.js`** を開き、値を書き換える：

   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://abcd1234.supabase.co',   // ← Project URL
     anonKey: 'eyJ...',                      // ← anon public キー
   };
   ```

   > anon key は公開しても安全な鍵です（下のRLS設定でデータが守られます）。

## 3. データ保存用テーブルを作る

左メニュー **SQL Editor** を開き、以下を貼り付けて **Run**：

```sql
-- 1ユーザー=1行、アプリの状態をJSONで丸ごと保存するテーブル
create table if not exists public.app_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 行レベルセキュリティ：自分の行だけ読み書きできる
alter table public.app_state enable row level security;

create policy "own row - select" on public.app_state
  for select using (auth.uid() = user_id);
create policy "own row - insert" on public.app_state
  for insert with check (auth.uid() = user_id);
create policy "own row - update" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 4. ログイン用アカウントを1つ作る（=あらかじめ決めたID/パスワード）

1. 左メニュー **Authentication → Users → Add user → Create new user**
2. **Email**（これがログインID）と **Password** を入力
   - 例: `nomikai@example.com` / 好きなパスワード
   - 「Auto Confirm User」をオンにする（メール確認をスキップ）
3. 作成。これが全員で共有して使うログイン情報になります。

> 補足：メール確認を求められて困る場合は **Authentication → Providers → Email** の
> 「Confirm email」をオフにすると、確認なしでログインできます。

## 5. 動作確認

1. アプリを開く → サイドバー下の **☁️ クラウド同期** をクリック
2. 4で決めたメールアドレスとパスワードでログイン
3. 初回は「この端末のデータをクラウドに保存しました」と出れば成功（＝吸い上げ完了）
4. Supabase の **Table Editor → app_state** に1行入っていればOK

以降は、データを変更するたびに自動でクラウドへ保存されます。
別の端末でログインすれば、同じデータが読み込まれます。

---

## よくある質問

**Q. 今あるデータは消える？**
いいえ。localStorage のデータはそのまま残り、初回ログイン時にクラウドへコピー（吸い上げ）されます。
念のため、設定前に一度「📤 バックアップ」でJSONを保存しておくと万全です。

**Q. ログアウトしたらデータは消える？**
いいえ。端末内（localStorage）のデータは残ります。クラウド同期が止まるだけです。

**Q. 2台で同時に編集したら？**
最後に保存した方の内容が残ります（簡易的な同期のため）。ログイン時に食い違いがあれば
「クラウドを読むか／この端末を保存するか」を確認するダイアログが出ます。
