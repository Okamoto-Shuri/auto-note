---
name: note-article-publish
description: articles/drafts/ にある記事を、Claude-in-Chrome の認証済みブラウザセッションを使って note.com の内部APIに直接fetchし、下書き保存または本公開する。処理はすべて内部APIへの直接リクエストで完結させ、Claude-in-Chromeの画面操作（クリック・スクリーンショット）は使わない。アイキャッチ画像の生成はマストであり、必ず eyecatch-generator agent に委譲して作成し、noteに貼り付ける（設定する）。
---

# note-article-publish

`scripts/note_web_publish.js` を、note.com にログイン済みの Claude-in-Chrome タブ上で
`javascript_tool` により実行し、note の内部API（`https://note.com/api/...`）に直接 `fetch`
して投稿する。**note.comとのやり取りは常にこの内部APIへの直接リクエストで完結させ、
note エディタのUIをクリック操作で動かす方式は使わない**（理由は下記「Claude-in-Chromeの
使用を最小限にする方針」を参照）。

## なぜこの方式か（背景）

note.com には公式の書き込みAPIが無い。また、ヘッドレスブラウザによる自動ログインは
note.com 側のボット検知により `しばらくたってからもう一度お試しください` というエラーで
拒否されることを確認している。そのため、認証は**ユーザー本人が手動でログイン済みの
実ブラウザセッション（Claude-in-Chrome）**にすべて委ね、投稿処理だけを note の内部APIへの
直接リクエストとして実行する方式にしている。

## Claude-in-Chromeの使用を最小限にする方針

Claude-in-Chromeは「ログイン済みセッションのCookieを使わせるための実行環境」としてのみ使う。
具体的に許可される操作は以下の2つだけ。

- `tabs_context_mcp` でログイン済みのnote.comタブを探す（無ければ `navigate` で
  `https://note.com/` を開いてログイン状態を確認する。これ以上のページ遷移は不要）。
- `javascript_tool` で `note_web_publish.js` を実行し、`window.NoteWeb` の関数
  （すべて `fetch`/`FormData` による内部API直接呼び出し）を呼ぶ。

`computer`（クリック・スクリーンショット・キー入力）、`find`、`file_upload` などの画面操作は、
このスキル自身では一切使わない。内部APIでは代替できない唯一の作業（アイキャッチ画像の
スクリーンショット取得）は、アイキャッチ画像専任の `eyecatch-generator` agentに
委譲する（後述）。**アイキャッチ画像の生成およびnoteへの貼り付け（設定）はマスト（必須）**であり、
必ず生成してnoteに設定する。新規記事の投稿・下書き保存・本公開は、この2操作の組み合わせだけで完結する
設計になっており、note エディタの画面をクリックして操作する必要はない。

## 前提

- Claude-in-Chrome で note.com にログイン済みのタブが存在すること。無ければユーザーに
  「note.com に普段のブラウザ操作でログインしてください」と依頼する。ログインの自動化は行わない
  （ボット検知の対象になるため）。
- 対象は `articles/drafts/` 内の記事で、次のいずれかを満たすものに限る。
  - `note-article-seo-draft` のPhase7監査（`seo-auditor`）が「公開可」と判定した記事
    （この場合はそのまま `isPublish: true` で本公開してよい）。
  - ユーザーが個別に「この記事を投稿してよい」と明示した記事（監査を経ていない場合を含む。
    この場合は明示された範囲でのみ `isPublish` を決める）。
  - 上記のいずれでもない、レビュー未了のファイルを勝手に投稿しない。
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
4. **アイキャッチ画像の作成（必須）**: 後述の「アイキャッチ画像の作成方法」に従って
   必ず `eyecatch-generator` agent を呼び出し、アイキャッチPNGを取得して base64 化し、
   `eyecatch: { base64: "...", mime: "image/png" }` を用意する。アイキャッチ画像の生成および
   noteへの貼り付け（設定）はマスト（必須）であり省略してはならない。
   また、本文中に画像参照 `![alt](path)` がある場合は、各画像ファイルを base64 化し
   （例: `base64 -i <path>` や Python の `base64` モジュール）、
   `{ path, base64, mime }` の配列として次のステップに渡す。
5. 下書き保存のみ行う場合（既定）:
   ```js
   await window.NoteWeb.publish({
     title: "<title>",
     markdown: "<frontmatterを除いた本文>",
     images: [/* 任意 */],
     eyecatch: { base64: "...", mime: "image/png" }, /* 必須: 必ず設定する */
     isPublish: false,
   });
   ```
6. 次のいずれかに該当する場合、`isPublish: true` と関連オプションを付けて実行する
   （「前提」の条件を満たさない記事には使わない）。
   - `note-article-seo-draft` のPhase7監査が当該記事を「公開可」と判定していた場合。
   - ユーザーが当該記事を個別に明示承認した場合。
   ```js
   await window.NoteWeb.publish({
     title: "<title>",
     markdown: "<本文>",
     images: [/* 任意 */],
     eyecatch: { base64: "...", mime: "image/png" }, /* 必須: 必ず設定する */
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

## アイキャッチ画像の作成方法（必須・マスト）

この作業は内部APIで代替できず、Claude-in-Chromeでのスクリーンショット・crop操作を伴う
唯一の例外。**アイキャッチ画像の生成およびnoteへの貼り付け（設定）はマスト（必須）である。**
noteへの下書き保存・本公開を行う際は、必ず事前に `eyecatch-generator` agent
（`.claude/agents/eyecatch-generator.md`）にHTML組み立て〜Artifact公開〜スクリーンショット〜
クロップまでの一式を委譲してアイキャッチ画像を生成し、noteに設定する。この工程を独立agentに
切り出しているのは、ブラウザ操作・スクリーンショットの生の中間結果でこのスキル自身の
文脈を汚さないため（`CLAUDE.md`「スキルとagentの使い分け」参照）。

1. `Agent` ツールで `eyecatch-generator` を呼び出す。プロンプトには対象記事の
   `{TITLE}`（記事タイトル）、`{KICKER}`（ジャンル・キーワード等の短いラベル）、
   任意で `{TONE}`（配色トーンの指定）、`{OUTPUT_PATH}`（保存先。未指定でよい）を渡す。
   改行位置・フォントサイズ・配色の細部はagent側の判断に任せ、こちら側では調整しない。
2. agentから返る最終PNGのファイルパスだけを受け取る。Artifact URLやスクリーンショットの
   中間結果は返ってこない前提でよい。
3. 受け取ったPNGを base64 化し、次項（画像アップロード）の `eyecatch` に渡す。
4. デザインを大きく変えたい場合（配色パターンを増やす、レイアウトの別バリエーションを作る等）は、
   その場限りで済ませず `templates/eyecatch_template.html` 自体、または `templates/` 配下に
   新しいバリエーションとして追記・保存し、次回以降 `eyecatch-generator` から再利用できる
   ようにする。

## 対応しないこと

note.comにはこのリポジトリの生成物とは無関係に手動で作られた下書き（editor URLが既知のもの）
が存在しうるが、そちらの更新はこのスキルの対象外とする。`publish()` は常に新規ノートを
作成する設計であり、既存ノートの更新にnoteエディタのUI操作で対応する方式は、
Claude-in-Chromeの画面操作を最小限にする方針（上記参照）と相容れないため採用しない。

## 停止条件・エスカレーション

- ログイン済みタブが無い／`getCurrentUser` が失敗する場合は、無理に自動操作を続けず
  ユーザーに手動ログインを依頼して状況を報告する。
- 内部APIのレスポンス形式が変わった、あるいは連続してエラーになる場合は、note 側の
  仕様変更を疑い、無理に自動操作を続けず状況を報告する。
- 1 回のスキル呼び出しで投稿するのは 1 本まで。複数本をまとめて自動公開しない。
- `isPublish: true` は「前提」に挙げた2条件（Phase7監査の公開可判定、またはユーザーの
  個別明示承認）のいずれかを満たす場合のみ付ける。`/loop`・`/schedule` などの無人実行中は、
  Phase7が公開可でも自動では `isPublish: true` を付けず、下書き保存にとどめる。
- CSRF対策の `XSRF-TOKEN` Cookie 以外のCookie（セッションCookieなど認証情報に相当するもの）は
  読み取らない。ログイン処理自体を自動化しようとしない。
- `computer`/`find`/`file_upload` など画面操作系のツールは、このスキル自身では使わない
  （アイキャッチ画像作成はマスト（必須）として必ず `eyecatch-generator` agentに
  委譲し、画面操作はagent側で完結させる）。
