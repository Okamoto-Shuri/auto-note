---
name: note-article-draft
description: 指定したトピック（または articles/state.json の topic_backlog の先頭）から note 記事の下書きを Markdown で生成し、自己検証してから articles/drafts/ に保存する。
---

# note-article-draft

記事 1 本分の生成〜自己検証までを 1 ターンで完結させるスキル。
「手作業での確認手順を SKILL.md に落とし込み、Claude 自身に検証させる」ことが目的なので、
生成して終わりにせず、必ず手順4の自己検証を実施すること。

## 手順

1. トピックを決める。
   - 引数でトピックが渡されていればそれを使う。
   - 渡されていなければ `articles/state.json` の `topic_backlog` の先頭を使う。
   - どちらも無ければユーザーに確認する（無理にトピックをでっち上げない）。
2. `CLAUDE.md` の「記事のスタイルガイド」を読み、トーン・文字数目安・禁止事項に従う。
3. 記事本文を Markdown で執筆し、`articles/drafts/<slug>.md` に保存する。冒頭に以下の frontmatter を付ける。
   ```yaml
   ---
   title: "<記事タイトル>"
   topic_id: "<topic_backlog の id、無ければ null>"
   status: "draft"
   created_at: "<ISO8601>"
   ---
   ```
4. **自己検証（省略しない）**。以下を上から順にチェックし、満たさない項目があれば修正してから再チェックする。
   - タイトルが空でない、かつ `articles/state.json` の `published` / `drafts` の既存タイトルと重複していない
   - 本文の文字数がスタイルガイドの目安範囲内（未設定なら 1500〜3000 字を目安とする）
   - 見出し構成があり、導入・本文・まとめの流れになっている
   - 事実として断定している固有名詞・数値・引用がある場合、確認が取れないものは断定表現を避けるか
     「要確認」の注記を残す（ハルシネーションで断定しない）
   - 差別的表現・誹謗中傷・著作権侵害の疑いがある引用がない
5. 検証を通過したら `articles/state.json` を更新する。
   - `drafts` に `{ "file": "articles/drafts/<slug>.md", "title": ..., "created_at": ... }` を追加
   - トピックを `topic_backlog` から取り除き `topic_history` に移す
6. 生成したファイルパスと、自己検証の結果（何を確認し、問題なかったか/直したか）を報告する。

## 停止条件

- 自己検証を 3 回試しても解消できない問題がある場合は、公開せず理由を添えてユーザーに報告する。
- ここでは note への投稿は行わない（投稿は `note-article-publish` の役割）。
