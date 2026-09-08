# auto-note

Claude Code に note.com 向けの記事執筆〜下書き投稿を任せるための下準備リポジトリ。
設計の考え方は [`CLAUDE.md`](./CLAUDE.md) を参照。

## セットアップ

Python の依存関係インストールなどは不要。必要なのはブラウザでのログインだけ。

1. Claude-in-Chrome（Claude Code のブラウザ拡張連携）が使える状態にしておく。
2. 普段使いのブラウザで [note.com](https://note.com) に手動でログインしておく。
   投稿処理はこのログイン済みセッションをそのまま使うため、ログインの自動化は行わない
   （note.com 側のボット検知でヘッドレス自動ログインが拒否されることを確認済み）。
3. `CLAUDE.md` の「記事のスタイルガイド」を、実際に書かせたいトーン・文字数・NGトピックで埋める。
   ここが空のままだとスキルは既定値（1500〜3000字、方針は都度確認）で動く。

投稿は `scripts/note_web_publish.js` が note.com の内部API（非公式）を直接呼び出して行う。
note 側の仕様変更で動かなくなる可能性がある前提で使うこと。

## 使い方（手動 / ターンベース）

```
note のネタを5個考えて（note-topic-ideas）
「<トピック>」で note の記事を1本ドラフトして（note-article-draft）
articles/drafts/<slug>.md を note に下書き保存して（note-article-publish）
```

`note-article-publish` は、note.com にログイン済みの Claude-in-Chrome タブ上で
`scripts/note_web_publish.js` を実行し、`NoteWeb.publish(...)` を呼び出す。
既定は下書き保存のみ（`isPublish: false`）。実際に公開する場合のみ、対象記事を明示指定した上で
`isPublish: true` を指定するようユーザーが依頼する。

## ゴールベースで回す（/goal）

明確な本数目標があるとき向け。

```
/goal note-topic-ideas と note-article-draft を使って、今週中に記事ドラフトを3本 articles/drafts/ に用意する。
      各記事は自己検証を通過していること。5回試して達成できなければ状況を報告して止まる。
```

## 時間ベースで回す（/loop）

セッションを開いたまま、一定間隔でドラフトを積んでいきたいとき向け。

```
/loop 1d note-topic-ideas でバックログが3件未満なら補充し、note-article-draft で1本だけドラフトを作る。
      1日1本を超えて生成しない。
```

## プロアクティブ運用（/schedule）

人が介在しなくても定期的にドラフトを積んでおきたいとき向け。**公開はしない**設計なので、
定期実行しても投稿が暴走することはない（下書きが articles/drafts/ に溜まるだけ）。

```
/schedule 毎朝9時に note-topic-ideas（backlogが3件未満のときのみ）→ note-article-draft を1本実行するルーチンを作って。
          articles/state.json の drafts が5件を超えたら生成を止めて通知して。
```

実際に note へ公開する（下書き保存を超えて公開ボタンまで押す）操作は、必ず
ユーザーが個別の記事を指定して明示的に依頼したときのみ `note-article-publish` に行わせること。
また、下書き保存する `note-article-draft`/`note-article-publish` の呼び出し自体は
Claude-in-Chrome での操作を伴うため、`/schedule` での完全放置運用時も note.com への
ログインセッションが有効であることが前提になる。

## ディレクトリ

- `.claude/skills/` — 各作業を自己検証込みで実行するスキル群
- `scripts/note_web_publish.js` — note 内部APIを直接叩く投稿スクリプト（Claude-in-Chromeで実行）
- `articles/drafts/` — 生成済み・レビュー待ちの記事
- `articles/published/` — 実際に note へ公開した記事のアーカイブ
- `articles/state.json` — トピック履歴・下書き/投稿履歴（重複防止・状態管理用）

## 品質を保つための運用ルール

- スキルの自己検証だけに頼らず、まとまった変更（スキルの手順自体を直したときなど）は
  `/code-review` を通す。
- `articles/state.json` は手で直接編集してよいが、スキルが読む形式（キー名）を壊さないこと。
- トークン消費を抑えるため、`/loop` `/schedule` の間隔・1回あたりの生成本数は
  小さく始めて様子を見てから広げる。
