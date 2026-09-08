---
name: note-article-publish
description: articles/drafts/ にある承認済みの記事を、Claude in Chrome のブラウザ操作で note.com に下書き保存する（既定では公開ボタンは押さない）。
---

# note-article-publish

note.com には投稿用の公式書き込み API が無いため、既にログイン済みの Chrome セッションを
ブラウザ操作で動かして投稿する。**このスキルは既定で「下書き保存」までしか行わない。**
実際に公開するかどうかは必ず人間が note.com 上で最終確認して押す。

## 前提

- ユーザーが Chrome で note.com に手動ログイン済みであること。ログインしていない場合は
  作業を進めず、ログインを依頼する（パスワード等の認証情報をこのスキルが扱うことは無い）。
- 対象は `articles/drafts/` 内の、ユーザーが投稿してよいと明示した記事に限る。
  `note-article-draft` が生成しただけで未レビューのファイルを勝手に投稿しない。

## 手順

1. 対象の下書きファイル（例: `articles/drafts/<slug>.md`）を読む。frontmatter の `status` が
   `draft` であることを確認する。ユーザーから明示的に「これを投稿して」と指示された記事のみ進める。
2. Claude in Chrome のツールをロードする（未ロードの場合）。
   `ToolSearch("select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp")`
3. 新規タブで `https://note.com/notes/new` を開く。ログイン状態でない場合は中断してユーザーに報告する。
4. タイトル欄・本文欄に frontmatter の `title` と本文 Markdown を入力する。
   - note のエディタは独自リッチテキストなので、Markdown の見出し・箇条書きなどは崩れる可能性がある。
     入力後は `read_page` 等で結果を確認し、明らかに崩れていればユーザーに報告して手動調整を依頼する。
5. **「公開する」ボタンは押さない。** 下書き保存（自動保存 or 明示的な下書き保存操作）のみ行う。
   ユーザーが「公開してよい」と明示的に指示した場合に限り、公開操作まで行ってよい。
6. 完了したら `articles/state.json` を更新する。
   - 下書き保存のみの場合: `drafts` の該当エントリに `note_draft_url` を追記
   - 公開まで行った場合: `articles/drafts/<slug>.md` を `articles/published/<slug>.md` に移動し、
     `published` に `{ "file", "title", "note_url", "published_at" }` を追加、`drafts` から除去
7. 実施した操作（下書き保存のみ／公開まで行ったか）と note 側の URL をユーザーに報告する。

## 停止条件・エスカレーション

- ログインしていない、エディタの構造が想定と違う、入力後の崩れが直せない、などは
  無理に自動操作を続けず状況を報告して人間に引き継ぐ。
- 1 回のスキル呼び出しで投稿するのは 1 本まで。複数本をまとめて自動公開しない。
