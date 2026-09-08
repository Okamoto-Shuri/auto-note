# auto-note

Claude Code に note.com 向けの記事執筆〜下書き投稿を任せるための下準備リポジトリ。
設計の考え方は [`CLAUDE.md`](./CLAUDE.md) を参照。

## セットアップ

1. Chrome で note.com に手動ログインしておく（このリポジトリは認証情報を一切保持しない）。
2. `CLAUDE.md` の「記事のスタイルガイド」を、実際に書かせたいトーン・文字数・NGトピックで埋める。
   ここが空のままだとスキルは既定値（1500〜3000字、方針は都度確認）で動く。

## 使い方（手動 / ターンベース）

```
note のネタを5個考えて（note-topic-ideas）
「<トピック>」で note の記事を1本ドラフトして（note-article-draft）
articles/drafts/<slug>.md を note に下書き保存して（note-article-publish）
```

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

## ディレクトリ

- `.claude/skills/` — 各作業を自己検証込みで実行するスキル群
- `articles/drafts/` — 生成済み・レビュー待ちの記事
- `articles/published/` — 実際に note へ公開した記事のアーカイブ
- `articles/state.json` — トピック履歴・下書き/投稿履歴（重複防止・状態管理用）

## 品質を保つための運用ルール

- スキルの自己検証だけに頼らず、まとまった変更（スキルの手順自体を直したときなど）は
  `/code-review` を通す。
- `articles/state.json` は手で直接編集してよいが、スキルが読む形式（キー名）を壊さないこと。
- トークン消費を抑えるため、`/loop` `/schedule` の間隔・1回あたりの生成本数は
  小さく始めて様子を見てから広げる。
