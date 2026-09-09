# auto-note

Claude Code に note.com 向けの記事執筆〜投稿を任せるための下準備リポジトリ。
設計の考え方は [`CLAUDE.md`](./CLAUDE.md) を参照。

## セットアップ

Python の依存関係インストールなどは不要。必要なのはブラウザでのログインだけ。

1. Claude-in-Chrome（Claude Code のブラウザ拡張連携）が使える状態にしておく。
2. 普段使いのブラウザで [note.com](https://note.com) に手動でログインしておく。
   投稿処理はこのログイン済みセッションの Cookie をそのまま使うため、ログインの自動化は行わない
   （note.com 側のボット検知でヘッドレス自動ログインが拒否されることを確認済み）。
3. `CLAUDE.md` の「記事のスタイルガイド」を、実際に書かせたいトーン・文字数・NGトピックで埋める。
   ここが空のままだとスキルは既定値（2500〜4500字、方針は都度確認）で動く。

投稿は `scripts/note_web_publish.js` が note.com の内部API（非公式）に直接 `fetch` するだけで
完結する。Claude-in-Chrome はこのスクリプトを認証済みセッション上で実行するための実行環境
（ログイン済みタブの検出・スクリプト実行）として使うのみで、クリックやスクリーンショットなどの
画面操作は原則使わない。note 側の仕様変更で動かなくなる可能性がある前提で使うこと。

## 使い方（note-article-seo-draft）

検索意図分析・差別化設計・タイトル比較・章単位の自己チェック・100点満点の品質監査までを
通しで行う、このリポジトリで唯一の記事生成スキル。狙ったキーワードでの上位表示や読み応えを
重視した記事を作る。

```
「<狙いたいキーワード>」で note-article-seo-draft を使って記事を1本作って、問題なければ投稿して
```

EEAT（実績・一次情報）や記事のゴールなど、こちらで補えない項目は質問される。
成果物は `articles/drafts/<slug>.md`（note投稿用の本文）と `articles/drafts/<slug>.seo-brief.md`
（検索意図分析・差別化設計・品質監査などの内部資料。note には投稿しない）の2ファイル。

**Phase7の品質監査（`seo-auditor` agent）が「公開可」と判定した記事は、そのまま
`note-article-publish` に引き継いで `isPublish: true` での本公開まで行ってよい。** 監査の合格が
公開の承認を兼ねるため、改めて「公開していいですか」と聞き直す必要はない。下書き保存だけで
止めたい場合は依頼時に「下書きだけでいい」のように明示する。改稿必須のまま基準を満たさない
記事は投稿せず、スコアと理由を報告して止まる。

既存記事のリライトにも対応（軽量モード：検索意図分析→差別化設計→品質監査のみを回す。
この場合はファイルを自動上書きせず、改稿案を提示してユーザーの承認を待つ）。

内部的には検索意図分析（`seo-researcher`）・差別化/構成設計（`seo-planner`）・品質監査
（`seo-auditor`）を専任のsubagent（`.claude/agents/`）に委譲している。特に品質監査は、
書いた本人が自分の記事を採点すると甘くなりがちなため、執筆の経緯を一切共有しない独立agentに
完成品だけを見せて評価させる設計にしている。詳しくは `CLAUDE.md` の「スキルとagentの使い分け」
を参照。

```
articles/published/claude-code-vs-codex-2026.md を note-article-seo-draft でリライト分析して
```

`note-article-publish` は、note.com にログイン済みの Claude-in-Chrome タブ上で
`scripts/note_web_publish.js` を `javascript_tool` で実行し、`NoteWeb.publish(...)` を呼び出す。
この呼び出し自体は内部APIへの `fetch` のみで完結し、画面操作は行わない。下書き保存のみで
終える場合は `isPublish: false`、本公開まで行う場合は `isPublish: true` を指定する。

## ゴールベースで回す（/goal）

明確な本数目標があるとき向け。

```
/goal note-article-seo-draft を使って、今週中に記事を3本 articles/drafts/ に用意する（投稿はしない）。
      各記事はPhase7監査を通過していること。5回試して達成できなければ状況を報告して止まる。
```

## 時間ベースで回す（/loop）

セッションを開いたまま、一定間隔でドラフトを積んでいきたいとき向け。

```
/loop 1d note-topic-ideas でバックログが3件未満なら補充し、note-article-seo-draft で1本だけ
      ドラフトを作る（投稿はしない）。1日1本を超えて生成しない。
```

## プロアクティブ運用（/schedule）

人が介在しなくても定期的にドラフトを積んでおきたいとき向け。`/loop`・`/schedule` などの
無人実行中は、Phase7監査を通過しても既定では**下書き保存までにとどめ、本公開はしない**
（自動投稿が暴走しないための安全弁）。

```
/schedule 毎朝9時に note-topic-ideas（backlogが3件未満のときのみ）→ note-article-seo-draft を
          1本、下書きまで実行するルーチンを作って。articles/state.json の drafts が5件を
          超えたら生成を止めて通知して。
```

無人実行で溜まった下書きを実際に公開する場合は、必ずユーザーが個別の記事を指定して
明示的に依頼したときのみ `note-article-publish` に `isPublish: true` で行わせること。
また、下書き保存の呼び出し自体は Claude-in-Chrome での実行を伴うため、`/schedule` での
完全放置運用時も note.com へのログインセッションが有効であることが前提になる。

## ディレクトリ

- `.claude/agents/` — 検索意図分析・差別化/構成設計・品質監査を担当する独立subagent
- `.claude/skills/` — 各作業を自己検証込みで実行するスキル群
  （`note-article-seo-draft` は詳細な各Phase指示を `references/pipeline.md` に分離している）
- `scripts/note_web_publish.js` — note 内部APIへの直接fetchで完結する投稿スクリプト
  （Claude-in-Chromeは実行環境としてのみ使う）
- `articles/drafts/` — 生成済み・レビュー待ちの記事
- `articles/published/` — 実際に note へ公開した記事のアーカイブ
- `articles/state.json` — トピック履歴・下書き/投稿履歴（重複防止・状態管理用）

## 品質を保つための運用ルール

- スキルの自己検証だけに頼らず、まとまった変更（スキルの手順自体を直したときなど）は
  `/code-review` を通す。
- `articles/state.json` は手で直接編集してよいが、スキルが読む形式（キー名）を壊さないこと。
- トークン消費を抑えるため、`/loop` `/schedule` の間隔・1回あたりの生成本数は
  小さく始めて様子を見てから広げる。
