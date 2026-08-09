# Firebase セットアップ手順（クラウド同期）

このアプリのクラウド同期は Firebase(Google)を使います。
**無料プランでも放置で止まることがない**ので、Supabase 時代のような
「気づいたら停止していた」「keep-alive が必要」といった手間はありません。

作業は一度だけ。全部で10〜15分くらいです。

## 1. Firebase プロジェクトを作る

1. https://console.firebase.google.com を開き、**aboshi.daisuke@gmail.com** でログインする
   - 別のアカウント(datechan68)で開いてしまったら、画面右上のアイコン →「別のアカウントを追加」で aboshi.daisuke@gmail.com に切り替える
2. 「**プロジェクトを作成**」→ 名前は `nomikai` など好きなもの
3. 「Google アナリティクス」は **無効(オフ)** でOK → 作成

## 2. Web アプリを登録して接続情報をもらう

1. プロジェクトのトップ画面で **`</>`(ウェブ)** のアイコンをクリック
2. アプリのニックネームは `bbq` など適当に。「Firebase Hosting」のチェックは**不要**
3. 表示される `firebaseConfig = { ... }` の中から、次の3つの値をコピー:
   - `apiKey`
   - `authDomain`
   - `projectId`
4. このフォルダの **`firebase-config.js`** を開き、`YOUR-...` の部分を上の値に書き換えて保存

## 3. ログイン機能(Authentication)を有効にする

1. 左メニュー「構築」→「**Authentication**」→「始める」
2. 「**メール / パスワード**」を選んで**有効にする**(「メールリンク」はオフのまま)→ 保存
3. 「**Users**」タブ →「**ユーザーを追加**」で、ログイン用アカウントを1つ作る:
   - **メール**: `好きなID` + `@nomikai.local`(例: IDを `bbq` にするなら `bbq@nomikai.local`)
   - **パスワード**: `好きなパスワード` + `#nomikai`(例: パスワードを `abc123` にするなら `abc123#nomikai`)

   > ⚠️ `@nomikai.local` と `#nomikai` はアプリが内部で自動的に付け足す文字です。
   > そのため Firebase 側にはこの形で登録しておく必要があります。
   > **アプリのログイン画面では「bbq」「abc123」のように付け足しなしで入力**します。

## 4. データベース(Firestore)を作る

1. 左メニュー「構築」→「**Firestore Database**」→「データベースを作成」
2. ロケーションは **asia-northeast1(東京)** を選択
3. 「**本番環境モード**」で開始
4. 作成できたら「**ルール**」タブを開き、内容を丸ごと以下に置き換えて「**公開**」:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /app_state/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

(意味: 「ログインした本人だけが、自分のデータを読み書きできる」)

## 5. 動作確認

1. アプリ(index.html)を開く
2. サイドバーの「☁️ クラウド同期」→ 手順3で決めた **ID とパスワード**(付け足しなし)でログイン
3. 「☁️ この端末のデータをクラウドに保存しました」等が表示されれば完了!

> 📱 **複数端末で使う場合**: 先に「一番新しいデータが入っている端末」でログインしてください。
> その端末のデータがクラウドに保存され、他の端末はログインするとそれを受け取ります。

## 補足

- `firebase-config.js` の値は公開されても問題ないもの(鍵はルールで守られる)
- データは1ユーザー=1ドキュメントの小さな JSON なので、無料枠を超える心配はまずない
- 旧 Supabase(nomikai プロジェクト)は移行が済んだら放置してOK。止まってもデータは各端末の localStorage と Firebase 側にある
