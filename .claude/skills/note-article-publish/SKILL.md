---
name: note-article-publish
description: articles/drafts/ にある承認済みの記事を、Claude-in-Chrome の認証済みブラウザセッションから note.com の内部APIを直接呼び出して投稿する。既定では下書き保存のみ行い、公開は行わない。アイキャッチ画像の作成（Artifact経由）や、editor URLが分かっている既存下書きの投稿にも対応。
---

# note-article-publish

`scripts/note_web_publish.js` を、note.com にログイン済みの Claude-in-Chrome タブ上で実行し、
note の内部API（`https://note.com/api/...`）を直接叩いて投稿する。
**このスキルは既定で「下書き保存」までしか行わない。** 実際に公開するのは、ユーザーが対象記事を
明示的に指名して「公開してよい」と言った場合のみ。

## なぜこの方式か（背景）

note.com には公式の書き込みAPIが無い。当初は非公式ライブラリ NoteClient2（Playwright による
ヘッドレスログイン + 内部API）を使う方針だったが、note.com 側のボット検知により
ヘッドレスブラウザからの自動ログインが `しばらくたってからもう一度お試しください` という
エラーで拒否されることを確認した。そのため、認証は**ユーザー本人が手動でログイン済みの
実ブラウザセッション（Claude-in-Chrome）**にすべて委ね、投稿処理だけを note の内部APIへの
直接リクエストとして実行する方式に切り替えている。

## 前提

- Claude-in-Chrome で note.com にログイン済みのタブが存在すること。無ければユーザーに
  「note.com に普段のブラウザ操作でログインしてください」と依頼する。ログインの自動化は行わない
  （ボット検知の対象になるため）。
- 対象は `articles/drafts/` 内の、ユーザーが投稿してよいと明示した記事に限る。
  `note-article-draft` が生成しただけで未レビューのファイルを勝手に投稿しない。
- note.com は非公式にリバースエンジニアリングした内部APIであり、note 側の仕様変更で
  壊れる可能性がある前提で運用する。過度な自動投稿・スパム的な連続投稿はしない。

## 手順

1. 対象の下書きファイル（例: `articles/drafts/<slug>.md`）を読む。frontmatter の `status` が
   `draft` であることを確認し、`title` と本文（frontmatter を除いた部分）を取り出す。
2. Claude-in-Chrome のタブコンテキストを取得し、note.com にログイン済みのタブを特定する
   （無ければ `https://note.com/` を開いてログイン状態を確認する。未ログインならユーザーに
   手動ログインを依頼して待つ）。
3. `scripts/note_web_publish.js` の内容を、そのタブ上で `javascript_tool` により実行し、
   `window.NoteWeb` を定義する（ページ遷移するたびに再実行が必要）。
4. 本文中に画像参照 `![alt](path)` がある場合は、各画像ファイルを base64 化し
   （例: `base64 -i <path>` や Python の `base64` モジュール）、
   `{ path, base64, mime }` の配列として次のステップに渡す。アイキャッチも同様に用意する
   （`--eyecatch` 相当。任意）。
5. 下書き保存のみ行う場合（既定）:
   ```js
   await window.NoteWeb.publish({
     title: "<title>",
     markdown: "<frontmatterを除いた本文>",
     images: [/* 任意 */],
     isPublish: false,
   });
   ```
6. ユーザーが当該記事を明示的に公開承認した場合のみ、`isPublish: true` と関連オプションを付けて
   実行する:
   ```js
   await window.NoteWeb.publish({
     title: "<title>",
     markdown: "<本文>",
     images: [/* 任意 */],
     eyecatch: { base64: "...", mime: "image/png" } /* 任意 */,
     hashtags: ["タグ1", "タグ2"],
     price: 0,
     magazineKeys: [] /* 任意 */,
     isPublish: true,
   });
   ```
   - 有料記事にする場合は、本文 Markdown 中に `<pay>` タグ（1行のみ・1回のみ）が
     意図通りの位置にあるか事前に確認し、`price` に0より大きい値を指定する。
7. 戻り値の `ok` を確認する。`false` なら `error` フィールドをそのままユーザーに報告し、
   勝手にリトライしすぎない（1〜2回まで）。成功時、下書きは `data.editUrl`、
   公開時は `data.publicUrl` に note 側のURLが入る。
8. 成功した場合、`articles/state.json` を手動で更新する（`note_web_publish.js` 自体は
   state.json を触らないため、このスキルの実行者が更新する）。
   - 下書き保存: `drafts` に `{ file, title, note_url: data.editUrl, note_id: data.noteId,
     note_key: data.noteKey, is_publish: false, at }` を追加/更新
   - 公開: 該当エントリを `drafts` から削除し、`published` に
     `{ file, title, note_url: data.publicUrl, note_id: data.noteId, note_key: data.noteKey,
     is_publish: true, at }` を追加
9. 実施した操作（下書き保存のみ／公開まで行ったか）と note 側のURLを報告する。

## アイキャッチ画像の作成方法（テンプレート + Artifactを使う）

note 用の画像を生成するツールは無いため、あらかじめ用意した HTML テンプレート
（`templates/eyecatch_template.html`）を元にタイトルを差し込んだHTMLを作り、
それをArtifactとして描画してClaude-in-Chromeでスクリーンショットし、PNG化する。
デザインを毎回ゼロから考えると時間がかかる＆できあがりが安定しないので、**必ずこの
テンプレートを起点にする**（一から新しいデザインを考えない）。

テンプレートの特徴: 濃紺〜黒の背景に紫・シアン・コーラルのぼかしオーブ＋薄いグリッド＋
グレインでモダンな質感を出し、Google Fonts の Noto Sans JP (weight 900) で
デカデカとした極太タイトルを左寄せで配置するデザイン。`{{KICKER}}`（記事のジャンル等の
小さなラベル）と `{{TITLE}}`（記事タイトル）の2箇所だけ差し替えれば使える。

1. `templates/eyecatch_template.html` を読み、`{{KICKER}}` と `{{TITLE}}` を実際の値に
   置換したコピーをスクラッチパスに作る（テンプレート本体は編集しない）。
   - `{{TITLE}}` は長い記事タイトルをそのまま入れると1行に収まらないので、
     自然な区切りに手動で `<br>` を入れて2〜3行に収める（1行の目安は10〜14文字）。
   - 文字量に応じて `.title` の `font-size`（既定104px）を90px〜130pxの範囲で調整してよい。
   - 背景の配色（`.orb-a/b/c` の色）は記事のトーンに合わせて変えてよいが、
     「濃い背景＋ぼかしオーブ＋極太の大きいタイトル」という基本構造は崩さない。
2. `Artifact` ツールで公開する（`file://` のローカルHTMLはClaude-in-Chromeから開けず
   `Can't interact with browser-internal or unparseable URLs` エラーになるため、
   **必ずArtifactとして公開してからそのURLを開く**）。
3. 新規タブで Artifact URL に `navigate`、`resize_window` で 1280×670 程度にリサイズし
   （テンプレートは `100vw/100vh` 基準なので正確な一致は不要）、Google Fontsの読み込みを
   待つため1〜2秒 `wait` してから `computer` の `screenshot` を撮る。
4. Artifactページ自体に上部ツールバー（タイトル・Shareボタン等、高さ約40px）が付くため、
   そのまま保存すると余計なUIが写り込む。`computer` の `zoom` action で
   region を `[0, 41, <画面幅>, <画面高さ>]`（上部40〜41pxを除外）に指定し
   `save_to_disk: true` を付けて保存する。これがクロップ済みの最終画像になる。
5. 保存されたPNGのパスを次項（画像アップロード）に使う。使い終わった検証用タブは閉じてよい。
6. デザインを大きく変えたい場合（配色パターンを増やす、レイアウトの別バリエーションを作る等）は、
   都度その場で作るのではなく `templates/eyecatch_template.html` 自体、または
   `templates/` 配下に新しいバリエーションとして追記・保存し、次回以降も再利用できるようにする。

## 既に作成途中の下書き（editor URLがわかっている場合）の投稿

ユーザーから `https://editor.note.com/notes/<key>/edit/` のようなURLを渡された場合、
その記事は既に note 上に下書きとして存在する。`note_web_publish.js` の `publish()` は
**常に新規ノートを作成する**設計であり、既存ノートの更新には対応していないため、
このケースでは同スクリプトの `publish()` をそのまま使わない。

1. ログイン済みタブで対象の editor URL を開く。
2. 既存ノートの数値ID・現在の状態は、ログイン済みタブ上で以下のように取得できる
   （`window.NoteWeb` の関数を使わず直接fetchでよい）:
   ```js
   const res = await fetch('https://note.com/api/v3/notes/<key>', {credentials:'include'});
   const j = await res.json();
   // j.data.id (数値ID), j.data.is_draft, j.data.eyecatch, j.data.hashtag_notes,
   // j.data.user.urlname （公開後のURL組み立てに使う） など
   ```
3. アイキャッチの追加・本文の公開は、内部APIを個別に組み立てるより **note エディタのUIを
   そのまま操作する方が速く、本文HTML再構築によるミスも避けられる**。以下の流れで進める。
   - エディタ左上のアイキャッチ追加アイコンをクリック →「画像をアップロード」
     （UIに推奨サイズ1280×670pxと表示される）。
   - **重要**: 「画像をアップロード」ボタンを直接 `computer` でクリックすると、
     見えないネイティブのファイル選択ダイアログが開いてしまい、後続の操作がブロックされる。
     代わりに、先に `find` で `type=file` の input 要素を探し、その `ref` に対して
     `file_upload` ツールでローカル画像パスを直接渡すこと（クリック不要）。
     誤ってクリックしてしまった場合は `computer` の `key: Escape` でダイアログを閉じてからやり直す。
   - アップロード後に出るクロップ/プレビューダイアログで「保存」をクリック。
   - 「下書き保存」→「公開に進む」で公開設定画面（ハッシュタグ等）に遷移。
   - 必要ならハッシュタグを追加（画面下部の候補をクリック、または入力してEnter）。
   - ユーザーが当該記事の公開を明示的に承認している場合のみ「投稿する」をクリックする。
   - 公開後に出る「記事をシェアしてみましょう」ダイアログのSNS共有ボタン（X/Facebook/LINE等）は
     **ユーザーの明示的な許可なく絶対にクリックしない**。`×` で閉じる。
4. 公開URLは `https://note.com/<urlname>/n/<key>` の形式（`urlname` は手順2のレスポンスから
   取得できる）。
5. 完了後は、通常の手順8と同様に `articles/state.json` を更新し、対象ファイルを
   `articles/drafts/` から `articles/published/` へ移動する。

## 停止条件・エスカレーション

- ログイン済みタブが無い／`getCurrentUser` が失敗する場合は、無理に自動操作を続けず
  ユーザーに手動ログインを依頼して状況を報告する。
- 内部APIのレスポンス形式が変わった、あるいは連続してエラーになる場合は、note 側の
  仕様変更を疑い、無理に自動操作を続けず状況を報告する。
- 1 回のスキル呼び出しで投稿するのは 1 本まで。複数本をまとめて自動公開しない。
- `isPublish: true` は必ずユーザーが個別の記事について明示的に指示した場合のみ付ける。
  ループ実行中に自動判断で `isPublish: true` を付けない。
- CSRF対策の `XSRF-TOKEN` Cookie 以外のCookie（セッションCookieなど認証情報に相当するもの）は
  読み取らない。ログイン処理自体を自動化しようとしない。
