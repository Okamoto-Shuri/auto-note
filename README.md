# auto-note

Codexにnote.com向けの記事執筆〜投稿を任せるためのリポジトリ。
設計の考え方は[`AGENTS.md`](./AGENTS.md)を参照。

## セットアップ

Node.js 22以上とGoogle Chromeが必要。npm依存パッケージはない。

1. このプロジェクトを信頼済みとしてCodexで開く。`.codex/config.toml`によりローカルSTDIO MCP
   `note_publisher`が自動登録される。Codex CLI/IDEを既に開いていた場合は一度再起動する。
2. 初回だけ`npm run note:browser`を実行し、開いた専用Chromeで[note.com](https://note.com)へ
   ユーザー本人が手動ログインする。認証情報は`~/.auto-note/chrome-profile`に保存され、リポジトリには入らない。
3. `npm run note:status`で`"loggedIn": true`を確認する。

投稿は `scripts/note_web_publish.js` が note.com の内部API（非公式）に直接 `fetch` するだけで
完結する。`note_publisher` MCPは専用Chromeのログイン済みタブを検出し、Chrome DevTools Protocolで
同スクリプトを実行するだけで、エディタのクリックやスクリーンショット操作は行わない。Cookieを
MCPへ抽出せず、ページ内コードもCSRF用`XSRF-TOKEN`以外のCookieを読まない。note側の仕様変更で
壊れる可能性がある前提で使うこと。

## 使い方（note-article-seo-draft）

検索意図分析・差別化設計・タイトル比較・章単位の自己チェック・簡易ファクトチェックまでを
通しで行う、このリポジトリで唯一の記事生成スキル。狙ったキーワードでの上位表示や読み応えを
重視した記事を作る。

```
「<狙いたいキーワード>」で note-article-seo-draft を使って記事を1本作って、問題なければ投稿して
```

EEAT（実績・一次情報）や記事のゴールなど、こちらで補えない項目は質問される。
成果物は `articles/drafts/<slug>.md`（note投稿用の本文）と `articles/drafts/<slug>.seo-brief.md`
（検索意図分析・差別化設計・ファクトチェックなどの内部資料。note には投稿しない）の2ファイル。

**Phase7の簡易ファクトチェック（`seo-auditor` agent）を経て必要箇所の修正が完了した記事は、
公開／下書きの指定が無ければそのまま `note-article-publish` に引き継ぎ、`is_publish: true` で
本公開まで行う。** 改めて「公開していいですか」と聞き直してはならない。下書き保存だけで
止めたい場合は依頼時に「下書きだけでいい」のように明示する。

既存記事のリライトにも対応（軽量モード：検索意図分析→差別化設計→簡易ファクトチェックのみを回す。
この場合はファイルを自動上書きせず、修正案を提示してユーザーの承認を待つ）。

内部的には検索意図分析（`seo-researcher`）・差別化/構成設計（`seo-planner`）・簡易ファクトチェック
（`seo-auditor`）を専任のsubagent（`.codex/agents/`）に委譲している。特にファクトチェックは、
書いた本人がチェックすると見落としが生じやすいため、執筆の経緯を共有しない独立agentに
完成品だけを見せて客観的に確認させる設計にしている。

```
articles/published/claude-code-vs-codex-2026.md を note-article-seo-draft でリライト分析して
```

`note-article-publish`は`note_publisher` MCPの`publish_note`を呼ぶ。MCPが専用Chromeのnoteタブ上で
`scripts/note_web_publish.js`を実行し、`NoteWeb.publish(...)`を呼び出す。この呼び出し自体は
内部APIへの`fetch`のみで完結し、画面操作は行わない。指定が無ければ
`is_publish: true`（本公開）。下書き保存のみで終える場合だけ `is_publish: false` を指定する。

## ゴールベースで回す（/goal）

明確な本数目標があるとき向け。

```
/goal note-article-seo-draft を使って、今週中に記事を3本 articles/drafts/ に用意する（投稿はしない）。
      各記事はPhase7ファクトチェック・修正を通過していること。5回試して達成できなければ状況を報告して止まる。
```

## 時間ベースで回す（/loop）

セッションを開いたまま、一定間隔でドラフトを積んでいきたいとき向け。

```
/loop 1d note-topic-ideas でバックログが3件未満なら補充し、note-article-seo-draft で1本だけ
      ドラフトを作る（投稿はしない）。1日1本を超えて生成しない。
```

## プロアクティブ運用（/schedule）

人が介在しなくても定期的にドラフトを積んでおきたいとき向け。`/loop`・`/schedule` などの
無人実行中は、Phase7ファクトチェックを通過しても既定では**下書き保存までにとどめ、本公開はしない**
（自動投稿が暴走しないための安全弁）。

```
/schedule 毎朝9時に note-topic-ideas（backlogが3件未満のときのみ）→ note-article-seo-draft を
          1本、下書きまで実行するルーチンを作って。articles/state.json の drafts が5件を
          超えたら生成を止めて通知して。
```

無人実行で溜まった下書きを実際に公開する場合は、必ずユーザーが個別の記事を指定して
明示的に依頼したときのみ `note-article-publish` に `is_publish: true` で行わせること。
また、下書き保存の呼び出し自体は専用Chromeセッションを使うため、`/schedule`での
完全放置運用時も note.com へのログインセッションが有効であることが前提になる。

## ディレクトリ

`.agents/` と `.codex/` はClaude Code由来の重複ではなく、Codexが用途別に定める標準配置。
[スキル](https://developers.openai.com/codex/skills)は `.agents/skills/`、
[プロジェクト設定](https://developers.openai.com/codex/config-basic)と
[カスタムエージェント](https://developers.openai.com/codex/subagents)は `.codex/` に置く。

- `.codex/agents/` — 検索意図分析・差別化/構成設計・簡易ファクトチェック・アイキャッチ画像生成
  （`eyecatch-generator`）を担当する独立subagent
- `.agents/skills/` — 各作業を自己検証込みで実行するスキル群
  （`note-article-seo-draft` は詳細な各Phase指示を `references/pipeline.md` に分離している）
- `scripts/note_mcp_server.mjs` — Codexに3つの限定ツールを公開するローカルMCPサーバー
- `scripts/note_cdp.mjs` — 専用Chromeセッションの起動・検出・ページ内スクリプト実行
- `scripts/note_web_publish.js` — note内部APIへの直接fetchで完結する投稿スクリプト
- `articles/drafts/` — 生成済み・レビュー待ちの記事
- `articles/published/` — 実際に note へ公開した記事のアーカイブ
- `articles/state.json` — トピック履歴・下書き/投稿履歴（重複防止・状態管理用）

## 品質を保つための運用ルール

- スキルの自己検証だけに頼らず、まとまった変更（スキルの手順自体を直したときなど）は
  `/code-review` を通す。
- `articles/state.json` は手で直接編集してよいが、スキルが読む形式（キー名）を壊さないこと。
- トークン消費を抑えるため、`/loop` `/schedule` の間隔・1回あたりの生成本数は
  小さく始めて様子を見てから広げる。
