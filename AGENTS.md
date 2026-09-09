# auto-note

note.com への記事投稿を Codex に自動化させるプロジェクト。詳しい使い方・起動例は
[`README.md`](./README.md) を参照。ここには Codex がこのリポジトリで作業する上で
知っておくべき最小限の情報のみを書く。

## 初期セットアップ（最初に一度だけ）

1. Node.js 22 以上と Google Chrome が必要（npm 依存パッケージはなし）。
2. このプロジェクトを信頼済みとして Codex で開く。`.codex/config.toml` により
   ローカル STDIO MCP `note_publisher` が自動登録される（既に Codex を開いていた
   場合は再起動が必要）。
3. 初回だけ `npm run note:browser` を実行し、開いた専用 Chrome で note.com へ
   **ユーザー本人が手動で**ログインする。認証情報は `~/.auto-note/chrome-profile`
   に保存され、リポジトリには入らない（自動ログインは行わない・行えない設計）。
4. `npm run note:status` で `"loggedIn": true` を確認する。

## 記事作成の流れ

記事の中身を作るのはこのリポジトリ唯一のスキル **`note-article-seo-draft`**。
Phase 0〜7 の8段階パイプラインを実行するが、**全Phaseをこのスキル自身がこなす
わけではなく、独立性・客観性が要る工程だけ `.codex/agents/` の専任 subagent に
委譲する**（Phase の依存関係が強いため、subagentは1つずつ順番に呼ぶ。並列呼び出しはしない）。

| Phase | 担当 |
|---|---|
| 0. 要件定義ヒアリング | スキル自身（共通変数はまず `AGENTS.md`／`articles/state.json` から埋め、それでも埋まらない項目だけユーザーに聞く） |
| 1. 検索意図の逆算解析 | `seo-researcher` agent（検索最小限、信頼性の高いサイト最大3つ程度に絞る） |
| 2. 差別化設計 / 3. 構成設計 | `seo-planner` agent（差別化角度・クラスター設計・アウトライン） |
| 4. タイトル/導入〜6. 実装要素（FAQ・内部リンク・CTA） | スキル自身（文体を通す必要があるため分割しない） |
| 7. 簡易ファクトチェック | `seo-auditor` agent（書いた本人だと見落としやすいため、完成品だけを見せる独立した第三者に委ねる。指摘があればスキル自身が本文に反映する） |

`{KW}`（主軸キーワード）が指定されなければ、別スキル `note-topic-ideas` が管理する
`articles/state.json` の `topic_backlog` 先頭を使う。

成果物は `articles/drafts/<slug>.md`（note に載せる本文）と
`articles/drafts/<slug>.seo-brief.md`（Phase 0〜7の設計・監査ドキュメント。
note には投稿しない内部資料）の2ファイル。既存記事のリライトは軽量モード
（Phase 1→2→7 のみ）で行い、この場合はファイルを自動上書きせず修正案を提示する。

Phase 7 のファクトチェック（および必要な修正）が完了したら、指定が無ければ
続けて次項の `note-article-publish` を呼び、そのまま本公開まで進める
（改めて公開可否をユーザーに確認しない）。「下書きだけでいい」と明示された場合、
および `/loop`・`/schedule` などの無人実行中のみ下書き保存に止める。

## 記事のスタイルガイド

`note-article-seo-draft` が Phase 0 で `{MEDIA}`（サイトのテーマ）・`{PERSONA}`
（想定読者）・`{EEAT}`（一次情報の扱い）・`{NG}`（禁止表現）・`{MIN_CHAR}`/`{MAX_CHAR}`
（文字数）を埋める際、まずここを参照する。`note-topic-ideas` もトピック選定でここを読む。
（未設定の項目は他資料からの推定に委ねられるため、方針を固定したい場合はここに追記する。）

- **一次情報（EEAT）を書かない**: 自分自身の実績・経験・データなどの一次情報は、記事に
  一切書かない方針で固定する。Phase 0 でこの項目をユーザーに確認する必要はなく、常に
  「一次情報なし」として進める（一次情報前提の差別化案は選ばない）。
- **本文の文字数は 4,000〜6,000字のレンジとする**（固定値。`{MIN_CHAR}`=4,000,
  `{MAX_CHAR}`=6,000）。Phase 0 で毎回確認せず既定値として使い、アウトライン設計・
  本文執筆でもこの範囲に収まるよう配分・調整する。
- **リサーチ・Web検索は最低限に抑え、信頼性の高いサイト最大3つ程度に絞る**: 検索は
  原則1〜2回にとどめ、詳細を深掘りする対象は公式ドメイン・公的機関・大手専門メディア
  など信頼性の高いサイト最大3つ程度に厳選する。多数のサイト巡回や再試行での時間浪費は禁止。
- **アイキャッチ画像の生成・noteへの貼り付けはマスト（必須）**: 必ず `eyecatch-generator`
  agent に委譲し、`templates/` 内のHTMLを視覚的な参考資料として `image_gen` で画像を
  一から生成する（HTMLのコピー・スクリーンショット化は禁止）。サイズは **1280×670px**。

## Codex がどう投稿するか

note.com には公式の書き込み API が無いため、内部API（非公式・リバースエンジニアリング）
を `scripts/note_web_publish.js` から直接 `fetch` する。`note_publisher` MCP は、ログイン
済みの専用 Chrome タブを Chrome DevTools Protocol で見つけて同スクリプトを実行するだけの
実行環境で、クリック・スクリーンショットなどの画面操作は行わない。アクセスする Cookie は
CSRF対策の `XSRF-TOKEN` のみで、セッションCookieなど認証情報そのものには触れない。

Codex（`note-article-publish` スキル）が実際に呼べる MCP ツールは次の3つだけ
（`.codex/config.toml` の `enabled_tools`）。

- `note_session_status` — 専用Chromeの起動・ログイン状態の確認
- `open_note_login` — 未ログイン時に専用Chromeを開く（手動ログイン待ち。資格情報の自動入力はしない）
- `publish_note` — `draft_path`（本文）・`eyecatch_path`（アイキャッチ、必須）・
  `is_publish`（既定 `true`＝本公開／`false`＝下書き保存）・`user_approved` 等を渡して
  1回の呼び出しで下書き1本を保存・公開する。成功時に `articles/state.json` を更新し、
  本公開なら本文を `articles/published/` へ移動する。

`scripts/note_web_publish.js` 自体には `deleteDraft`／`unpublishNote`／`deleteNote`
（下書き削除・公開の下書き差し戻し・記事削除）などの関数も実装されているが、
**MCPはこれらを一切ツールとして公開していない**ため、Codexからは呼び出せない
（安全のため意図的に未接続。新たにMCPツールとして繋がない）。いいね・フォロー・
コメント・メンバーシップ操作など投稿・管理以外の内部API機能も同様にスコープ外。

投稿先は常にユーザー本人の note アカウントのみ。非公式APIのため note 側の仕様変更で
壊れる可能性がある前提で運用し、過度な連続投稿・スパム的な運用はしない。

## ディレクトリ

Codexの現行仕様に合わせ、スキルとプロジェクト設定は意図的に別の標準ディレクトリへ置く。
`.agents/` と `.codex/` は重複ではないため、片方へ統合しない。

```
.codex/agents/     seo-researcher / seo-planner / seo-auditor / eyecatch-generator（*.toml）
.agents/skills/    note-topic-ideas / note-article-seo-draft / note-article-publish
scripts/           note_web_publish.js（内部API直叩き本体）, note_mcp_server.mjs（公開ツール3つのみ）,
                   note_cdp.mjs（専用Chrome起動/CDP接続）, note_publish_core.mjs（検証・state更新）
templates/         アイキャッチ画像の視覚的参考資料（色違いHTML、6種）
articles/          drafts/（下書き＋seo-brief）, published/（投稿済みアーカイブ）, state.json（履歴）
```
