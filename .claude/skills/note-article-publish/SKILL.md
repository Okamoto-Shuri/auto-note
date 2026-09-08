---
name: note-article-publish
description: articles/drafts/ にある承認済みの記事を、NoteClient2（非公式ライブラリ）経由で note.com に投稿する。既定では下書き保存のみ行い、公開は行わない。
---

# note-article-publish

note.com の非公式ライブラリ [NoteClient2](https://github.com/Mr-SuperInsane/NoteClient2)
（Playwright ログイン + 内部API、pip: `NoteClient2`）を `scripts/post_note.py` 経由で呼び出して投稿する。
**このスキルは既定で「下書き保存」までしか行わない。** 実際に公開するのは、ユーザーが対象記事を
明示的に指名して「公開してよい」と言った場合のみ。

## 前提

- `.env` に `email` / `password` / `user_url_id` が設定済みであること（`.env.example` 参照）。
  未設定・値が空なら作業を進めず、ユーザーに設定を依頼する。`.env` の中身を出力・引用しない。
- `pip install -r requirements.txt` と `playwright install` が実行済みであること。
- 対象は `articles/drafts/` 内の、ユーザーが投稿してよいと明示した記事に限る。
  `note-article-draft` が生成しただけで未レビューのファイルを勝手に投稿しない。
- NoteClient2 は非公式・非商用限定ライセンス（INSANE License）。個人の note アカウントでの
  利用の範囲で使い、過度な自動投稿・スパム的な連続投稿はしない。

## 手順

1. 対象の下書きファイル（例: `articles/drafts/<slug>.md`）を読む。frontmatter の `status` が
   `draft` であることを確認する。
2. 下書き保存のみ行う場合（既定）:
   ```
   python scripts/post_note.py articles/drafts/<slug>.md
   ```
3. ユーザーが当該記事を明示的に公開承認した場合のみ、必要なオプションを添えて実行する:
   ```
   python scripts/post_note.py articles/drafts/<slug>.md \
     --publish \
     --hashtag <タグ> --hashtag <タグ> \
     [--eyecatch articles/drafts/<slug>-eyecatch.png] \
     [--price 0] [--magazine <マガジンキー>]
   ```
   - 有料記事にする場合は、本文 Markdown 中に `<pay>` タグ（1行のみ・1回のみ）が
     意図通りの位置にあるか事前に確認する。
4. `python` の標準出力に出る JSON 結果を確認する。`"ok": true` でなければ、
   エラー内容（`error` フィールド）をそのままユーザーに報告し、勝手にリトライしすぎない（1〜2回まで）。
   成功時、下書きは `data.edit_url`、公開時は `data.public_url` に note 側の URL が入る。
5. 成功した場合、`articles/state.json` は `scripts/post_note.py` が自動で更新する
   （下書き保存なら `drafts` を更新、`--publish` なら `published` に移動）。追加の手作業は不要。
6. 実施した操作（下書き保存のみ／公開まで行ったか）と note 側の URL（結果 JSON にあれば）を報告する。

## 停止条件・エスカレーション

- `.env` が無い／ログインに失敗する／`ok: false` が続く場合は、無理に自動操作を続けず
  状況を報告して人間に引き継ぐ。ライブラリは非公式なので note 側の仕様変更で壊れる可能性がある
  ことを前提に、失敗時はまずこのスキルを疑い、必要なら手動投稿を提案する。
- 1 回のスキル呼び出しで投稿するのは 1 本まで。複数本をまとめて自動公開しない。
- `--publish` は必ずユーザーが個別の記事について明示的に指示した場合のみ付ける。
  ループ実行中に自動判断で `--publish` を付けない。
