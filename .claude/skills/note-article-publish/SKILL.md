---
name: note-article-publish
description: articles/drafts/ にある承認済みの記事を、Claude-in-Chrome の認証済みブラウザセッションから note.com の内部APIを直接呼び出して投稿する。既定では下書き保存のみ行い、公開は行わない。
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
