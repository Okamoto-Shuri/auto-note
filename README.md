# auto-note

Codexによるnote記事の企画・執筆・独立監査・画像生成・投稿。
入口は[AGENTS.md](AGENTS.md)、編集基準は[editorial-policy.md](docs/editorial-policy.md)。

## 初期設定

Node.js 22以上、Google Chromeが必要。npm依存パッケージなし。
プロジェクトを信頼済みとして開くと.codex/config.tomlのMCPが登録される。反映されなければCodexを再起動する。

1. npm run note:browserで専用Chromeを開く。
2. 本人がnoteへ手動ログインする。プロファイルは~/.auto-note/chrome-profile。
3. npm run note:statusでloggedIn:trueを確認する。

MCPは専用ChromeのCDP経由で内部APIを使う。画面クリック・自動ログインは行わない。
CSRF用XSRF-TOKEN以外のCookieを読み出さない。非公式API変更で失敗する場合がある。

## 依頼例

- 「円高について記事を1本書いて」：監査・修正後、画像付きで本公開。
- 「円高について、下書きだけ」：note上に下書き保存。
- 「円高について、投稿しない」：ローカルに本文とseo-briefを保存。
- 「articles/published/example.mdをリライト分析して」：分析・修正案提示。上書き・再公開はしない。

目的・文体・EEATの既定値は毎回質問しない。記事ごとの指定があれば優先する。
本文はarticles/drafts/<slug>.md、内部資料は同名<slug>.seo-brief.md。
本公開成功時はMCPが本文をpublishedへ移しstateを更新する。

## 無人実行

/loop・/scheduleではローカル下書きまで。noteへの保存・公開は個別に記事を指定して依頼する。
例：バックログが3件未満なら補充し、1日1本ローカル下書きを作成する。
ローカル記事作成にはChrome・ログイン不要。1回1記事とし過度な連続投稿はしない。

## 検証・障害対応

- node scripts/check_article.mjs <記事パス>：計数・SEOの機械チェック。文章の質・事実は独立監査で確認する。
- npm test：ローカルの回帰テスト。noteへの投稿は行わない。
- 投稿ツール内で記事を再取得し、保存/公開状態と画像URLを検証する。
- doNotRetry:trueや結果不明では再投稿しない。publication-attemptsの記録と返却IDを確認する。
- 既存noteの更新・修復は本人がエディタで行う。[復旧メモ](.agents/skills/note-article-publish/references/eyecatch-recovery.md)を参照。
- 公開成功・ローカル記録失敗でも再投稿しない。訂正はリモート状態を確定してから行う。
- 手順変更では[品質要件の移設記録](docs/workflow-quality-map.md)を照合し、コード変更はテストとdiffレビューを行う。

## 配置

- .agents/skills/：入口と親の手順。.codex/agents/：担当工程詳細。.codex/config.toml：MCP設定。
- docs/：共通編集方針・形式。templates/：画像の参考HTML。
- scripts/：計数・投稿・CDP・MCP。tests/：回帰確認。
- articles/drafts/：下書き・内部資料。articles/published/：公開済み本文。
- articles/state.json：履歴。articles/publication-attempts/：投稿試行記録・重複防止。
