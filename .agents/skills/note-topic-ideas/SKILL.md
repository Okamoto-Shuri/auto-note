---
name: note-topic-ideas
description: note 記事のトピック案を考え、articles/state.json の topic_backlog に重複なく追加する。ループの最初のステップとして、また単独でも使う。
---

# note-topic-ideas

note 記事のネタ切れを防ぐためのバックログ管理スキル。

## 手順

1. `articles/state.json` を読み、`topic_backlog`（未着手）と `topic_history`（過去に書いた/検討済み）を確認する。
2. `AGENTS.md` の「記事のスタイルガイド」セクションを読み、扱ってよい/避けるべきトピックの方針を確認する。
   方針が未設定の場合は、ユーザーに依頼された分野・引数で渡されたテーマを優先する。
3. 新しいトピック案を 3〜5 件考える。各案は以下を満たすこと。
   - `topic_history` および現在の `topic_backlog` と内容が重複・酷似していない
   - 1 記事として成立する具体性がある（広すぎる/狭すぎない）
4. `articles/state.json` の `topic_backlog` に追記する。各要素は次の形式。
   ```json
   { "id": "<slug>", "title": "<仮タイトル>", "note": "<補足>", "added_at": "<ISO8601>" }
   ```
5. 追加した案を一覧でユーザーに報告する。

## 停止条件

- 追加後の `topic_backlog` が指定件数（既定 5 件、引数で指定可）に達したら終了する。
- 新規に思いつく案が尽きた場合はその旨を報告して終了する（無理に埋めない）。
